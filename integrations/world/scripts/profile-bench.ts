// oxlint-disable no-console
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { createSimulation, SIMULATION_SECONDS } from "./simulation";

const args = yargs(hideBin(process.argv))
  .option("npcs", {
    type: "number",
    description: "Total NPCs spawned in the area",
    demandOption: true,
    default: 200,
  })
  .option("iterations", {
    type: "number",
    description: "Number of ticks to profile (default: one full sim)",
  })
  .strict()
  .parseSync();

const sim = await createSimulation({ npcCount: args.npcs });
const iterations = args.iterations ?? sim.tickHz * SIMULATION_SECONDS;

console.log(`profiling ${iterations} ticks @ ${args.npcs} NPCs (forest map)`);
const t0 = performance.now();
sim.tick(iterations);
const elapsedMs = performance.now() - t0;
await sim.stop();

console.log(
  `done in ${elapsedMs.toFixed(1)}ms (${((elapsedMs * 1000) / iterations).toFixed(0)}µs/tick)`,
);
console.log(`profiles → integrations/world/profiles/`);
console.log(`open .cpuprofile in chrome devtools → Performance`);
console.log(`open .heapprofile in chrome devtools → Memory → Load`);
