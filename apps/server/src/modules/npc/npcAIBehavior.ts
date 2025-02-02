import type { StateAccess } from "@mp/sync/server";
import type { TickEventHandler } from "@mp/time";
import { randomItem, recordValues } from "@mp/std";
import type { AreaLookup } from "../area/loadAreas";
import type { WorldState } from "../world/WorldState";

export function npcAIBehavior(
  accessState: StateAccess<WorldState>,
  areas: AreaLookup,
): TickEventHandler {
  return () => {
    accessState("npcAIBehavior", (state) => {
      for (const subject of recordValues(state.actors)) {
        if (subject.type !== "npc") {
          continue;
        }
        if (!subject.path) {
          const area = areas.get(subject.areaId);
          if (!area) {
            throw new Error(`Area not found: ${subject.areaId}`);
          }

          const fromNode = area.graph.getNearestNode(subject.coords);
          const toNode = randomItem(Array.from(area.graph.getNodes()));
          if (fromNode && toNode) {
            subject.path = area.findPath(fromNode.id, toNode.id);
          }
        }
      }
    });
  };
}
