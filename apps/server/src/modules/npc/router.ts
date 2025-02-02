import { vec } from "@mp/math";
import type { StateAccess } from "@mp/sync/server";
import type { Tile } from "@mp/std";
import { auth } from "../../middlewares/auth";
import { t } from "../../trpc";
import type { WorldState } from "../../package";
import type { AreaLookup } from "../area/loadAreas";
import { createNpcInstance } from "./npcSpawnBehavior";
import type { NPCService } from "./service";

export interface NPCRouterDependencies {
  state: StateAccess<WorldState>;
  areas: AreaLookup;
  npcService: NPCService;
}

export type NPCRouter = ReturnType<typeof createNPCRouter>;
export function createNPCRouter({
  state: accessState,
  areas,
  npcService,
}: NPCRouterDependencies) {
  return t.router({
    spawnProblematicNPC: t.procedure.use(auth()).mutation(async () => {
      const start = vec(3 as Tile, 15 as Tile);
      const end = vec(3 as Tile, 25 as Tile);

      const [{ npc }] = await npcService.getAllSpawnsAndTheirNpcs();

      const area = areas.values().find((area) => area.id === "forest");
      if (!area) {
        throw new Error(`Area not found: forest`);
      }

      const fromNode = area.graph.getNearestNode(start);
      const toNode = area.graph.getNearestNode(end);
      if (!fromNode || !toNode) {
        throw new Error(`Could not find nodes for start and end`);
      }
      const path = area.findPath(fromNode.id, toNode.id);

      accessState("world.spawnProblematicNPC", (state) => {
        const instance = createNpcInstance(npc, area.id, start);
        instance.path = path;
        state.actors[instance.id] = { type: "npc", ...instance };
      });
    }),
  });
}
