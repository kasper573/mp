import { vec, vec_add, type Vector } from "@mp/math";
import type { StateAccess } from "@mp/sync/server";
import type { TickEventHandler, TimeSpan } from "@mp/time";
import type { AreaLookup } from "../modules/area/loadAreas";
import type { WorldState } from "../modules/world/WorldState";
import type { NPC, NPCId } from "../modules/npc/schema";
import { updatePathForSubject } from "./movement";

export function npcAIBehavior(
  accessState: StateAccess<WorldState>,
  areas: AreaLookup,
): TickEventHandler {
  const memory = new Map<
    NPCId,
    {
      lastTimeMoved: TimeSpan;
      numberOfMoves: number;
    }
  >();

  const someArea = [...areas.values()][0];

  accessState("initialize npcs", (state) => {
    state.npcs[0] = {
      areaId: someArea.id,
      coords: someArea.start,
      id: 0,
      speed: 3,
      color: 0xff_00_00,
    };
  });

  function isItTimeToMove(subject: NPC, totalTimeElapsed: TimeSpan): boolean {
    const subjectMemory = memory.get(subject.id);
    if (!subjectMemory) {
      return true;
    }
    const delta = totalTimeElapsed.subtract(
      subjectMemory.lastTimeMoved,
    ).totalSeconds;
    return delta >= 2;
  }

  function getDestination(subject: NPC): Vector {
    const direction =
      (memory.get(subject.id)?.numberOfMoves ?? 0) % 2 ? vec(-1, 0) : vec(1, 0);

    return vec_add(subject.coords, direction);
  }

  function memorizeMove(subject: NPC, currentDelta: TimeSpan) {
    let subjectMemory = memory.get(subject.id);
    if (!subjectMemory) {
      subjectMemory = { lastTimeMoved: currentDelta, numberOfMoves: 0 };
      memory.set(subject.id, subjectMemory);
    }
    subjectMemory.lastTimeMoved = currentDelta;
    subjectMemory.numberOfMoves++;
  }

  return ({ totalTimeElapsed }) => {
    accessState("npcAIBehavior", (state) => {
      for (const subject of Object.values(state.npcs)) {
        if (isItTimeToMove(subject, totalTimeElapsed)) {
          updatePathForSubject(subject, areas, getDestination(subject));
          memorizeMove(subject, totalTimeElapsed);
        }
      }
    });
  };
}
