// oxlint-disable no-await-in-loop
// oxlint-disable no-console
import { performance } from "node:perf_hooks";
import { createSimulation } from "./simulation";

/**
 * Probes the simulation to find the largest NPC count at which the server can
 * still consistently meet its tick budget (i.e. doesn't drop frames). Binary
 * searches NPC count and reports the upper bound. Reuse this when iterating
 * on performance — when a new upper bound is found, add it to NPC_COUNT_SCENARIOS.
 */

const TICK_HZ = 20;
const TICK_BUDGET_MS = 1000 / TICK_HZ;
const SAMPLE_TICKS = 100;
const WARMUP_TICKS = 60;
/** Final granularity of the binary search. */
const RESOLUTION = 25;
/** Upper sanity cap on doubling phase, prevents runaway. */
const MAX_PROBE = 200_000;

interface Sample {
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
  readonly avg: number;
}

async function measureTick(npcCount: number): Promise<Sample> {
  const sim = await createSimulation({
    npcCount,
    tickHz: TICK_HZ,
    warmupTicks: WARMUP_TICKS,
    connectFakeClient: true,
  });
  const samples = new Array<number>(SAMPLE_TICKS);
  for (let i = 0; i < SAMPLE_TICKS; i++) {
    sim.transport.bytes.length = 0;
    sim.transport.packets.length = 0;
    const start = performance.now();
    sim.tick(1);
    samples[i] = performance.now() - start;
  }
  await sim.stop();
  samples.sort((a, b) => a - b);
  return {
    p50: samples[Math.floor(samples.length * 0.5)],
    p95: samples[Math.floor(samples.length * 0.95)],
    max: samples[samples.length - 1],
    avg: samples.reduce((a, b) => a + b, 0) / samples.length,
  };
}

function dropsFrames(s: Sample): boolean {
  return s.p95 > TICK_BUDGET_MS;
}

async function findUpperBound(): Promise<{
  readonly safe: number;
  readonly safeSample: Sample;
  readonly firstBad: number;
  readonly firstBadSample: Sample;
}> {
  let safe = 0;
  let safeSample: Sample = { p50: 0, p95: 0, max: 0, avg: 0 };
  let count = 25;
  let firstBad = 0;
  let firstBadSample: Sample = { p50: 0, p95: 0, max: 0, avg: 0 };

  while (count <= MAX_PROBE) {
    const sample = await measureTick(count);
    if (dropsFrames(sample)) {
      firstBad = count;
      firstBadSample = sample;
      break;
    }
    safe = count;
    safeSample = sample;
    count *= 2;
  }

  if (firstBad === 0) {
    return { safe, safeSample, firstBad: count, firstBadSample };
  }

  let lo = safe;
  let hi = firstBad;
  while (hi - lo > RESOLUTION) {
    const mid = Math.floor((lo + hi) / 2);
    const sample = await measureTick(mid);
    if (dropsFrames(sample)) {
      hi = mid;
      firstBadSample = sample;
    } else {
      lo = mid;
      safeSample = sample;
    }
  }
  return { safe: lo, safeSample, firstBad: hi, firstBadSample };
}

function fmt(n: number): string {
  return n.toFixed(2).padStart(7, " ");
}

const result = await findUpperBound();
console.log(`tick budget @ ${TICK_HZ}Hz = ${TICK_BUDGET_MS}ms (p95 threshold)`);
console.log(``);
console.log(`upper bound: ${result.safe} NPCs`);
console.log(
  `  safe       avg=${fmt(result.safeSample.avg)}ms  p50=${fmt(result.safeSample.p50)}ms  p95=${fmt(result.safeSample.p95)}ms  max=${fmt(result.safeSample.max)}ms`,
);
console.log(`  first-drop @ ${result.firstBad} NPCs:`);
console.log(
  `             avg=${fmt(result.firstBadSample.avg)}ms  p50=${fmt(result.firstBadSample.p50)}ms  p95=${fmt(result.firstBadSample.p95)}ms  max=${fmt(result.firstBadSample.max)}ms`,
);
