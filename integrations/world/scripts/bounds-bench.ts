// oxlint-disable no-await-in-loop
// oxlint-disable no-console
import { performance } from "node:perf_hooks";
import logUpdate from "log-update";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { createSimulation } from "./simulation";

/**
 * Probes the simulation across a 2D grid of (player count, NPC count) and
 * reports, for each player count, the largest NPC count at which each
 * individual budget is still satisfied. Budgets cover both tick latency and
 * wire throughput so we can see which axis runs out first as load grows.
 */

const TICK_HZ = 20;
const TICK_BUDGET_MS = 1000 / TICK_HZ;
// Doubling phase only needs "above or below threshold", so a shorter window
// is fine. Refine phase keeps the full window for precise p95.
const DOUBLING_SAMPLE_TICKS = 20;
const REFINE_SAMPLE_TICKS = 50;
const WARMUP_TICKS = 30;

const DEFAULT_PLAYER_COUNTS: readonly number[] = [1, 5, 25, 100];

/** Final granularity of the binary search. */
const RESOLUTION = 25;
/** Upper sanity cap on doubling phase, prevents runaway. */
const MAX_PROBE = 25_000;

const args = yargs(hideBin(process.argv))
  .option("players", {
    type: "string",
    description:
      "Comma-separated player counts to run (e.g. '1,5'). Defaults to all.",
  })
  .option("max-probe", {
    type: "number",
    description: `Cap on doubling phase NPC count. Default ${MAX_PROBE}.`,
  })
  .strict()
  .parseSync();

const playerCounts: readonly number[] = args.players
  ? args.players
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 0)
  : DEFAULT_PLAYER_COUNTS;
const maxProbe = args["max-probe"] ?? MAX_PROBE;

interface Sample {
  readonly tick: { avg: number; p50: number; p95: number; max: number };
  readonly packet: { avg: number; p50: number; p95: number; max: number };
  readonly perClient: {
    /** Average bytes/sec received per client over the sample window. */
    readonly avgBps: number;
    /** p95 across clients of "bytes received in window". */
    readonly p95Bps: number;
    /** Worst-client bytes/sec. */
    readonly maxBps: number;
  };
  /** Total server egress bytes/sec across all clients. */
  readonly aggregateBps: number;
}

interface MetricSpec {
  readonly name: string;
  readonly unit: string;
  readonly threshold: number;
  readonly extract: (s: Sample) => number;
}

const METRICS: readonly MetricSpec[] = [
  {
    name: "tick p95",
    unit: "ms",
    threshold: TICK_BUDGET_MS,
    extract: (s) => s.tick.p95,
  },
  {
    name: "packet max",
    unit: "B",
    // MTU is 1500B on Ethernet. Anything larger gets fragmented at the IP
    // layer, adding latency variance.
    threshold: 1500,
    extract: (s) => s.packet.max,
  },
  {
    name: "packet p95",
    unit: "B",
    // Stricter "no spikes near MTU" target — tolerates occasional outliers
    // while penalizing systemic bloat.
    threshold: 1200,
    extract: (s) => s.packet.p95,
  },
  {
    name: "per-client avg",
    unit: "B/s",
    // Casual upper bound for a single player connection. 30 KB/s is in line
    // with what other tile/action games sustain per client.
    threshold: 30_000,
    extract: (s) => s.perClient.avgBps,
  },
  {
    name: "per-client p95",
    unit: "B/s",
    threshold: 50_000,
    extract: (s) => s.perClient.p95Bps,
  },
  {
    name: "aggregate",
    unit: "B/s",
    // 100 MB/s ≈ 800 Mbps server egress. Anything past this is a fat-pipe
    // problem, not a code problem.
    threshold: 100_000_000,
    extract: (s) => s.aggregateBps,
  },
];

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[idx];
}

async function measure(
  playerCount: number,
  npcCount: number,
  sampleTicks: number,
): Promise<Sample> {
  const sim = await createSimulation({
    npcCount,
    playerCount,
    tickHz: TICK_HZ,
    warmupTicks: WARMUP_TICKS,
  });

  const tickSamples = new Array<number>(sampleTicks);
  sim.transport.resetCapture();
  for (let i = 0; i < sampleTicks; i++) {
    const start = performance.now();
    sim.tick(1);
    tickSamples[i] = performance.now() - start;
  }

  const elapsedSec = sampleTicks / TICK_HZ;
  const allPackets = [...sim.transport.bytes];
  const packetsSorted = [...allPackets].sort((a, b) => a - b);
  const tickSorted = [...tickSamples].sort((a, b) => a - b);

  const perClientBytes: number[] = [];
  for (const list of sim.transport.bytesByClient.values()) {
    perClientBytes.push(list.reduce((a, b) => a + b, 0));
  }
  const perClientBps = perClientBytes
    .map((b) => b / elapsedSec)
    .sort((a, b) => a - b);

  await sim.stop();

  const totalBytes = allPackets.reduce((a, b) => a + b, 0);
  return {
    tick: {
      avg: tickSamples.reduce((a, b) => a + b, 0) / tickSamples.length,
      p50: percentile(tickSorted, 0.5),
      p95: percentile(tickSorted, 0.95),
      max: tickSorted[tickSorted.length - 1] ?? 0,
    },
    packet: {
      avg: allPackets.length === 0 ? 0 : totalBytes / allPackets.length,
      p50: percentile(packetsSorted, 0.5),
      p95: percentile(packetsSorted, 0.95),
      max: packetsSorted[packetsSorted.length - 1] ?? 0,
    },
    perClient: {
      avgBps:
        perClientBps.length === 0
          ? 0
          : perClientBps.reduce((a, b) => a + b, 0) / perClientBps.length,
      p95Bps: percentile(perClientBps, 0.95),
      maxBps: perClientBps[perClientBps.length - 1] ?? 0,
    },
    aggregateBps: totalBytes / elapsedSec,
  };
}

interface PerMetricBound {
  /** Highest npcCount where this metric still passes. */
  safe: number;
  safeSample: Sample;
  /** Lowest npcCount where this metric fails (0 = never failed). */
  firstBad: number;
  firstBadSample: Sample;
}

function emptyBound(): PerMetricBound {
  return {
    safe: 0,
    safeSample: blankSample(),
    firstBad: 0,
    firstBadSample: blankSample(),
  };
}

function blankSample(): Sample {
  return {
    tick: { avg: 0, p50: 0, p95: 0, max: 0 },
    packet: { avg: 0, p50: 0, p95: 0, max: 0 },
    perClient: { avgBps: 0, p95Bps: 0, maxBps: 0 },
    aggregateBps: 0,
  };
}

function update(
  bound: PerMetricBound,
  npcCount: number,
  sample: Sample,
  threshold: number,
  extract: (s: Sample) => number,
): void {
  const value = extract(sample);
  if (value > threshold) {
    if (bound.firstBad === 0 || npcCount < bound.firstBad) {
      bound.firstBad = npcCount;
      bound.firstBadSample = sample;
    }
  } else if (npcCount > bound.safe) {
    bound.safe = npcCount;
    bound.safeSample = sample;
  }
}

async function findBoundsForPlayerCount(
  playerCount: number,
): Promise<readonly PerMetricBound[]> {
  const bounds = METRICS.map(() => emptyBound());

  // Doubling phase: short sample window — we only need above/below the
  // threshold, not precise percentiles. The refine phase tightens with the
  // full window.
  let count = 25;
  while (count <= maxProbe) {
    progress.set("phase", `probe ${count} npcs`);
    progress.render();
    const sample = await measure(playerCount, count, DOUBLING_SAMPLE_TICKS);
    let allFailed = true;
    for (let i = 0; i < METRICS.length; i++) {
      const m = METRICS[i];
      update(bounds[i], count, sample, m.threshold, m.extract);
      if (bounds[i].firstBad === 0) allFailed = false;
    }
    progress.setSample(count, sample);
    progress.render();
    if (allFailed) break;
    count *= 2;
  }

  // Shared binary-search refine: pick the metric with the widest remaining
  // bracket, probe its midpoint, then fold the resulting sample back into
  // EVERY metric's bracket. One measurement updates all live bounds.
  while (true) {
    let widestIdx = -1;
    let widestSpan = RESOLUTION;
    for (let i = 0; i < METRICS.length; i++) {
      const b = bounds[i];
      if (b.firstBad === 0) continue;
      const span = b.firstBad - b.safe;
      if (span > widestSpan) {
        widestSpan = span;
        widestIdx = i;
      }
    }
    if (widestIdx === -1) break;
    const drive = bounds[widestIdx];
    const mid = Math.floor((drive.safe + drive.firstBad) / 2);
    progress.set(
      "phase",
      `refine ${METRICS[widestIdx].name} ∈ [${drive.safe}, ${drive.firstBad}] @ ${mid}`,
    );
    progress.render();
    const sample = await measure(playerCount, mid, REFINE_SAMPLE_TICKS);
    for (let i = 0; i < METRICS.length; i++) {
      const b = bounds[i];
      if (b.firstBad === 0) continue;
      if (mid <= b.safe || mid >= b.firstBad) continue;
      const m = METRICS[i];
      if (m.extract(sample) > m.threshold) {
        b.firstBad = mid;
        b.firstBadSample = sample;
      } else {
        b.safe = mid;
        b.safeSample = sample;
      }
    }
    progress.setSample(mid, sample);
    progress.render();
  }

  return bounds;
}

interface ProgressState {
  scenario: string;
  phase: string;
  lastProbe: number;
  lastSample: Sample | undefined;
  startedAt: number;
}

const progress = createProgress();

function createProgress() {
  const state: ProgressState = {
    scenario: "",
    phase: "",
    lastProbe: 0,
    lastSample: undefined,
    startedAt: performance.now(),
  };

  function set<K extends keyof ProgressState>(
    key: K,
    value: ProgressState[K],
  ): void {
    state[key] = value;
  }

  function setSample(probe: number, sample: Sample): void {
    state.lastProbe = probe;
    state.lastSample = sample;
  }

  function setScenario(scenario: string): void {
    state.scenario = scenario;
    state.startedAt = performance.now();
    state.lastSample = undefined;
    state.lastProbe = 0;
  }

  function render(): void {
    const elapsed = ((performance.now() - state.startedAt) / 1000).toFixed(0);
    const header = `[${state.scenario}] (${elapsed}s) ${state.phase}`;
    const sample = state.lastSample;
    const detail = sample
      ? [
          `  last probe: ${state.lastProbe} npcs`,
          `  tick     p50=${fmt(sample.tick.p50)}ms p95=${fmt(sample.tick.p95)}ms max=${fmt(sample.tick.max)}ms`,
          `  packet   p95=${Math.round(sample.packet.p95)}B max=${Math.round(sample.packet.max)}B`,
          `  client   avg=${Math.round(sample.perClient.avgBps)}B/s p95=${Math.round(sample.perClient.p95Bps)}B/s`,
          `  aggregate ${Math.round(sample.aggregateBps)}B/s`,
        ].join("\n")
      : "";
    logUpdate(detail ? `${header}\n${detail}` : header);
  }

  function done(): void {
    logUpdate.clear();
    logUpdate.done();
  }

  return { set, setSample, setScenario, render, done };
}

function fmt(n: number): string {
  return n.toFixed(2).padStart(7, " ");
}

function fmtBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} kB`;
  return `${Math.round(n)} B`;
}

function fmtThreshold(m: MetricSpec): string {
  if (m.unit === "B/s") return `${fmtBytes(m.threshold)}/s`;
  if (m.unit === "B") return fmtBytes(m.threshold);
  return `${m.threshold} ${m.unit}`;
}

function fmtMetricValue(m: MetricSpec, v: number): string {
  if (m.unit === "B/s") return `${fmtBytes(v)}/s`;
  if (m.unit === "B") return fmtBytes(v);
  if (m.unit === "ms") return `${v.toFixed(2)} ms`;
  return `${v} ${m.unit}`;
}

console.log(
  `tick rate ${TICK_HZ} Hz, sample window doubling=${DOUBLING_SAMPLE_TICKS} ticks / refine=${REFINE_SAMPLE_TICKS} ticks`,
);
console.log(`thresholds:`);
for (const m of METRICS) {
  console.log(`  ${m.name.padEnd(18)} ≤ ${fmtThreshold(m)}`);
}
console.log("");

if (playerCounts.length === 0) {
  console.error(`no player counts to run (--players parsed as empty)`);
  process.exit(1);
}
console.log(`player counts: ${playerCounts.join(", ")}`);
console.log("");

for (const playerCount of playerCounts) {
  progress.setScenario(`${playerCount} player${playerCount === 1 ? "" : "s"}`);
  progress.set("phase", "starting");
  progress.render();
  const bounds = await findBoundsForPlayerCount(playerCount);
  progress.done();
  console.log(`\n=== ${playerCount} player${playerCount === 1 ? "" : "s"} ===`);
  console.log(
    `  metric              safe npcs   first-drop   safe value      drop value`,
  );
  for (let i = 0; i < METRICS.length; i++) {
    const m = METRICS[i];
    const b = bounds[i];
    const safeStr = String(b.safe).padStart(9);
    const dropStr =
      b.firstBad === 0 ? "    n/a  " : String(b.firstBad).padStart(9);
    const safeVal = fmtMetricValue(m, m.extract(b.safeSample)).padStart(14);
    const dropVal =
      b.firstBad === 0
        ? "          n/a"
        : fmtMetricValue(m, m.extract(b.firstBadSample)).padStart(14);
    console.log(
      `  ${m.name.padEnd(18)}${safeStr}    ${dropStr}    ${safeVal}    ${dropVal}`,
    );
  }
}
