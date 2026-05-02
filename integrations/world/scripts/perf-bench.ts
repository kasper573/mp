// oxlint-disable no-await-in-loop
// oxlint-disable no-console
import {
  bench,
  boxplot,
  compact,
  do_not_optimize,
  group,
  run,
  summary,
} from "mitata";
import {
  createSimulation,
  NPC_COUNT_SCENARIOS,
  SIMULATION_SECONDS,
  type Simulation,
} from "./simulation";

interface Scenario {
  readonly npcCount: number;
  readonly sim: Simulation;
  readonly totalTicks: number;
}

const scenarios: Scenario[] = [];
for (const npcCount of NPC_COUNT_SCENARIOS) {
  const sim = await createSimulation({ npcCount });
  scenarios.push({
    npcCount,
    sim,
    totalTicks: sim.tickHz * SIMULATION_SECONDS,
  });
  console.log(
    `[scenario ${npcCount} NPCs] area=${sim.area.id} ${sim.area.tiled.tileCount.x}x${sim.area.tiled.tileCount.y} tickHz=${sim.tickHz} ticks=${sim.tickHz * SIMULATION_SECONDS}`,
  );
}

function drainPackets(s: Simulation): void {
  s.transport.bytes.length = 0;
  s.transport.packets.length = 0;
}

for (const scenario of scenarios) {
  boxplot(() => {
    summary(() => {
      group(`server tick @ ${scenario.npcCount} NPCs`, () => {
        bench(`single tick (${scenario.npcCount} NPCs)`, () => {
          drainPackets(scenario.sim);
          scenario.sim.tick(1);
          do_not_optimize(scenario.sim.transport.bytes.length);
        }).gc("inner");

        bench(
          `${scenario.totalTicks} ticks / ${SIMULATION_SECONDS}s sim (${scenario.npcCount} NPCs)`,
          () => {
            drainPackets(scenario.sim);
            scenario.sim.tick(scenario.totalTicks);
            do_not_optimize(scenario.sim.transport.bytes.length);
          },
        ).gc("inner");
      });
    });
  });
}

compact(() => run());

for (const { sim } of scenarios) {
  await sim.stop();
}
