// oxlint-disable no-await-in-loop
// oxlint-disable no-console
import { performance } from "node:perf_hooks";
import logUpdate from "log-update";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { createSimulation } from "./simulation";

/**
 * Sweeps a (player count, NPC count) grid. For each (player count, metric)
 * pair we find the largest NPC count where the metric still passes its
 * threshold. The set of (player count, metric) pairs IS the list of
 * scenarios — generated upfront, then iterated.
 *
 * Scenarios sharing a player count are refined in a single shared
 * binary-search pass: one measurement produces values for every metric, so
 * we drive probes off the widest-bracket scenario and fold each sample into
 * every still-open scenario.
 */

// --- top-level constants ---------------------------------------------------

const TICK_HZ = 20;
const TICK_BUDGET_MS = 1000 / TICK_HZ;
const DOUBLING_SAMPLE_TICKS = 20;
const REFINE_SAMPLE_TICKS = 50;
const WARMUP_TICKS = 30;
const RESOLUTION = 25;
const DEFAULT_MAX_PROBE = 25_000;
const DEFAULT_PLAYER_COUNTS = [1, 25, 100, 250, 500] as const;

const CORE_METRICS: readonly MetricSpec[] = [
  {
    name: "server tick latency (p95)",
    unit: "ms",
    threshold: TICK_BUDGET_MS,
    extract: (s) => s.tick.p95,
  },
  {
    // MTU is 1500 B on Ethernet — beyond it IP-level fragmentation kicks in
    // and tail latency gets weird.
    name: "outbound packet size (max)",
    unit: "B",
    threshold: 1500,
    extract: (s) => s.packet.max,
  },
  {
    name: "outbound packet size (p95)",
    unit: "B",
    threshold: 1200,
    extract: (s) => s.packet.p95,
  },
  {
    // 30 kB/s sustained per player is in line with other tile/action games.
    name: "per-player bandwidth (avg)",
    unit: "B/s",
    threshold: 30_000,
    extract: (s) => s.perClient.avgBps,
  },
  {
    name: "per-player bandwidth (p95)",
    unit: "B/s",
    threshold: 50_000,
    extract: (s) => s.perClient.p95Bps,
  },
];

// Off by default — only fires at extreme NPC counts and brackets dominate
// wall time of high-player-count scenarios. Opt in with --aggregate.
const AGGREGATE_METRIC: MetricSpec = {
  // ~800 Mbps server egress — anything past this is a fat-pipe problem,
  // not a code problem.
  name: "total outbound bandwidth",
  unit: "B/s",
  threshold: 100_000_000,
  extract: (s) => s.aggregateBps,
};

const args = yargs(hideBin(process.argv))
  .option("players", {
    type: "string",
    description: "Comma-separated player counts to run, e.g. '1,5'.",
    default: DEFAULT_PLAYER_COUNTS.join(","),
    coerce: (raw: string): readonly number[] => {
      const parsed = raw
        .split(",")
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 0);
      if (parsed.length === 0) {
        throw new Error("--players parsed as empty");
      }
      return parsed;
    },
  })
  .option("maxProbe", {
    type: "number",
    description: "Cap on doubling phase NPC count.",
    default: DEFAULT_MAX_PROBE,
  })
  .option("aggregate", {
    type: "boolean",
    description:
      "Include the aggregate-egress metric. Off by default — it dominates wall time at high player counts and rarely fires usefully.",
    default: false,
  })
  .strict()
  .parseSync();

const METRICS: readonly MetricSpec[] = args.aggregate
  ? [...CORE_METRICS, AGGREGATE_METRIC]
  : CORE_METRICS;

// --- top-level execution ---------------------------------------------------

const scenarios: Scenario[] = args.players.flatMap((pc) =>
  METRICS.map((m) => makeScenario(pc, m)),
);

const groups = new Map<number, Scenario[]>();
for (const s of scenarios) {
  let g = groups.get(s.playerCount);
  if (!g) {
    g = [];
    groups.set(s.playerCount, g);
  }
  g.push(s);
}

const progress = createProgress();
progress.setTotal(scenarios.length);

console.log(`player counts under test: ${args.players.join(", ")}`);
console.log(`metric budgets:`);
for (const m of METRICS) {
  console.log(`  ${m.name.padEnd(30)} ≤ ${fmtThreshold(m)}`);
}

for (const [playerCount, group] of groups) {
  await runGroup(playerCount, group);
  progress.done();
  printGroupTable(playerCount, group);
}

// --- group execution -------------------------------------------------------

async function runGroup(playerCount: number, group: Scenario[]): Promise<void> {
  progress.setScenario(`${playerCount} player${playerCount === 1 ? "" : "s"}`);
  progress.set("phase", "starting");
  progress.render();

  // Doubling: each probe brackets every still-unbracketed metric. Stop once
  // every scenario has a firstBad (or we hit maxProbe).
  let count = 25;
  while (count <= args.maxProbe) {
    progress.set("phase", `testing with ${count} NPCs`);
    progress.render();
    const sample = await measure(playerCount, count, DOUBLING_SAMPLE_TICKS);
    applySample(group, count, sample);
    progress.setSample(count, sample);
    markResolved(group);
    progress.render();
    if (group.every((s) => s.firstBad !== 0)) break;
    count *= 2;
  }

  // Metrics that never failed within the probed range are bound = n/a.
  for (const s of group) {
    if (!s.resolved && s.firstBad === 0) {
      s.resolved = true;
      progress.bumpResolved();
    }
  }

  // Refine: pick widest-bracket unresolved scenario, probe its midpoint, fold
  // the resulting sample into every still-open scenario.
  while (true) {
    const widest = pickWidestUnresolved(group);
    if (!widest) break;
    const mid = Math.floor((widest.safe + widest.firstBad) / 2);
    progress.set(
      "phase",
      `narrowing "${widest.metric.name}" (${widest.safe} pass / ${widest.firstBad} fail); testing ${mid} NPCs`,
    );
    progress.render();
    const sample = await measure(playerCount, mid, REFINE_SAMPLE_TICKS);
    applySample(group, mid, sample);
    progress.setSample(mid, sample);
    markResolved(group);
    progress.render();
  }
}

function applySample(
  group: Scenario[],
  npcCount: number,
  sample: Sample,
): void {
  for (const s of group) {
    if (s.resolved) continue;
    // Only fold this probe into the bracket if npcCount actually sits inside
    // it. Without this guard a noisy out-of-bracket reading can invert the
    // bracket (firstBad < safe) — possible because samples aren't monotonic
    // in npcCount and shared-search drives probes that aren't necessarily
    // inside every metric's range.
    if (npcCount <= s.safe) continue;
    if (s.firstBad !== 0 && npcCount >= s.firstBad) continue;
    const value = s.metric.extract(sample);
    if (value > s.metric.threshold) {
      s.firstBad = npcCount;
      s.firstBadSample = sample;
    } else {
      s.safe = npcCount;
      s.safeSample = sample;
    }
  }
}

function markResolved(group: Scenario[]): void {
  for (const s of group) {
    if (s.resolved) continue;
    if (s.firstBad === 0) continue; // unbracketed (might still get a fail later)
    if (s.firstBad - s.safe <= RESOLUTION) {
      s.resolved = true;
      progress.bumpResolved();
    }
  }
}

function pickWidestUnresolved(group: Scenario[]): Scenario | undefined {
  let best: Scenario | undefined;
  let bestSpan = RESOLUTION;
  for (const s of group) {
    if (s.resolved) continue;
    if (s.firstBad === 0) continue; // unbracketed — can't refine
    const span = s.firstBad - s.safe;
    if (span > bestSpan) {
      bestSpan = span;
      best = s;
    }
  }
  return best;
}

// --- measurement -----------------------------------------------------------

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
    const t0 = performance.now();
    sim.tick(1);
    tickSamples[i] = performance.now() - t0;
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

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[idx];
}

// --- scenario construction -------------------------------------------------

function makeScenario(playerCount: number, metric: MetricSpec): Scenario {
  return {
    playerCount,
    metric,
    safe: 0,
    safeSample: blankSample(),
    firstBad: 0,
    firstBadSample: blankSample(),
    resolved: false,
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

// --- reporting -------------------------------------------------------------

function printGroupTable(playerCount: number, group: Scenario[]): void {
  const row = (name: string, bound: string) => `  ${name.padEnd(28)}  ${bound}`;

  console.log(`\n=== ${playerCount} player${playerCount === 1 ? "" : "s"} ===`);
  console.log(row("metric", "upper bound (NPCs before exceeding budget)"));
  for (const s of group) {
    const bound =
      s.firstBad === 0
        ? `${s.safe}+ (never exceeded budget within probe range)`
        : `${s.safe} (next @ ${s.firstBad} exceeded budget: ${fmtMetricValue(s.metric, s.metric.extract(s.firstBadSample))})`;
    console.log(row(s.metric.name, bound));
  }
}

// --- progress rendering ----------------------------------------------------

function createProgress() {
  const state: ProgressState = {
    scenario: "",
    resolved: 0,
    total: 0,
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

  function setScenario(label: string): void {
    state.scenario = label;
    state.startedAt = performance.now();
    state.lastSample = undefined;
    state.lastProbe = 0;
  }

  function setTotal(total: number): void {
    state.total = total;
  }

  function bumpResolved(): void {
    state.resolved += 1;
  }

  function render(): void {
    const elapsed = ((performance.now() - state.startedAt) / 1000).toFixed(0);
    const lines = [
      "",
      `[scenario ${state.resolved}/${state.total}] ${state.scenario}`,
      `  elapsed:               ${elapsed}s`,
      `  phase:                 ${state.phase}`,
    ];
    const sample = state.lastSample;
    if (sample) {
      lines.push(
        `  last test run:         ${state.lastProbe} NPCs`,
        `  server tick latency:   p50=${fmt(sample.tick.p50)}ms p95=${fmt(sample.tick.p95)}ms max=${fmt(sample.tick.max)}ms`,
        `  outbound packet size:  p95=${fmtBytes(sample.packet.p95)} max=${fmtBytes(sample.packet.max)}`,
        `  per-player bandwidth:  avg=${fmtBytes(sample.perClient.avgBps)}/s p95=${fmtBytes(sample.perClient.p95Bps)}/s`,
        `  total outbound:        ${fmtBytes(sample.aggregateBps)}/s`,
      );
    }
    logUpdate(lines.join("\n"));
  }

  function done(): void {
    logUpdate.clear();
    logUpdate.done();
  }

  return { set, setSample, setScenario, setTotal, bumpResolved, render, done };
}

// --- formatters ------------------------------------------------------------

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
  return `${v.toFixed(2)} ms`;
}

// --- types -----------------------------------------------------------------

interface Sample {
  readonly tick: { avg: number; p50: number; p95: number; max: number };
  readonly packet: { avg: number; p50: number; p95: number; max: number };
  readonly perClient: { avgBps: number; p95Bps: number; maxBps: number };
  readonly aggregateBps: number;
}

interface MetricSpec {
  readonly name: string;
  readonly unit: "ms" | "B" | "B/s";
  readonly threshold: number;
  readonly extract: (s: Sample) => number;
}

interface Scenario {
  readonly playerCount: number;
  readonly metric: MetricSpec;
  /** Highest NPC count where the metric still passes. */
  safe: number;
  safeSample: Sample;
  /** Lowest NPC count where the metric fails. 0 = never failed in probe range. */
  firstBad: number;
  firstBadSample: Sample;
  /** Bound is known to RESOLUTION precision (or proven n/a). */
  resolved: boolean;
}

interface ProgressState {
  scenario: string;
  resolved: number;
  total: number;
  phase: string;
  lastProbe: number;
  lastSample: Sample | undefined;
  startedAt: number;
}
