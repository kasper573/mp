// oxlint-disable no-await-in-loop
// oxlint-disable no-console
import { performance } from "node:perf_hooks";
import { createSimulation } from "./simulation";

/**
 * Probes the simulation across a 2D grid of (player count, NPC count) and
 * reports, for each player count, the largest NPC count at which each
 * individual budget is still satisfied. Budgets cover both tick latency and
 * wire throughput so we can see which axis runs out first as load grows.
 */

const TICK_HZ = 20;
const TICK_BUDGET_MS = 1000 / TICK_HZ;
const SAMPLE_TICKS = 50;
const WARMUP_TICKS = 30;

const PLAYER_COUNTS: readonly number[] = [1, 5, 25, 100];

/** Final granularity of the binary search. */
const RESOLUTION = 25;
/** Upper sanity cap on doubling phase, prevents runaway. */
const MAX_PROBE = 25_000;

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

async function measure(playerCount: number, npcCount: number): Promise<Sample> {
  const sim = await createSimulation({
    npcCount,
    playerCount,
    tickHz: TICK_HZ,
    warmupTicks: WARMUP_TICKS,
  });

  const tickSamples = new Array<number>(SAMPLE_TICKS);
  sim.transport.resetCapture();
  for (let i = 0; i < SAMPLE_TICKS; i++) {
    const start = performance.now();
    sim.tick(1);
    tickSamples[i] = performance.now() - start;
  }

  const elapsedSec = SAMPLE_TICKS / TICK_HZ;
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

  // Doubling phase: keep doubling until every metric has at least one
  // failing probe, or we hit MAX_PROBE.
  let count = 25;
  while (count <= MAX_PROBE) {
    const sample = await measure(playerCount, count);
    let allFailed = true;
    for (let i = 0; i < METRICS.length; i++) {
      const m = METRICS[i];
      update(bounds[i], count, sample, m.threshold, m.extract);
      if (bounds[i].firstBad === 0) allFailed = false;
    }
    console.log(
      `  probe ${count} npcs: tick_p95=${fmt(sample.tick.p95)}ms ` +
        `pkt_max=${Math.round(sample.packet.max)}B ` +
        `pkt_p95=${Math.round(sample.packet.p95)}B ` +
        `client_avg=${Math.round(sample.perClient.avgBps)}B/s ` +
        `agg=${Math.round(sample.aggregateBps)}B/s`,
    );
    if (allFailed) break;
    count *= 2;
  }

  // Binary-search refine each metric within its (safe, firstBad) bracket.
  for (let i = 0; i < METRICS.length; i++) {
    const m = METRICS[i];
    const b = bounds[i];
    if (b.firstBad === 0) continue; // never failed inside probe range
    let lo = b.safe;
    let hi = b.firstBad;
    while (hi - lo > RESOLUTION) {
      const mid = Math.floor((lo + hi) / 2);
      const sample = await measure(playerCount, mid);
      if (m.extract(sample) > m.threshold) {
        hi = mid;
        b.firstBad = mid;
        b.firstBadSample = sample;
      } else {
        lo = mid;
        b.safe = mid;
        b.safeSample = sample;
      }
    }
  }

  return bounds;
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
  if (m.unit === "B") return `${fmtBytes(m.threshold)}`;
  return `${m.threshold} ${m.unit}`;
}

function fmtMetricValue(m: MetricSpec, v: number): string {
  if (m.unit === "B/s") return `${fmtBytes(v)}/s`;
  if (m.unit === "B") return `${fmtBytes(v)}`;
  if (m.unit === "ms") return `${v.toFixed(2)} ms`;
  return `${v} ${m.unit}`;
}

console.log(
  `tick rate ${TICK_HZ} Hz, sample window ${SAMPLE_TICKS} ticks (${SAMPLE_TICKS / TICK_HZ}s)`,
);
console.log(`thresholds:`);
for (const m of METRICS) {
  console.log(`  ${m.name.padEnd(18)} ≤ ${fmtThreshold(m)}`);
}
console.log("");

for (const playerCount of PLAYER_COUNTS) {
  console.log(`\n=== ${playerCount} player${playerCount === 1 ? "" : "s"} ===`);
  const bounds = await findBoundsForPlayerCount(playerCount);
  console.log("");
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
