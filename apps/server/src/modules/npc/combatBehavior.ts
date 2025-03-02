import type { PatchStateMachine } from "@mp/sync/server";
import type { TickEventHandler } from "@mp/time";
import { recordValues } from "@mp/std";
import type { WorldState } from "../world/WorldState";

export function combatBehavior(
  state: PatchStateMachine<WorldState>,
): TickEventHandler {
  return () => {
    for (const subject of recordValues(state.actors())) {
      if (subject.health <= 0 && subject.type == "npc") {
        state.actors.remove(subject.id);
      }
    }
  };
}
