import type { Path } from "@mp/math";
import { vec, vec_add, type Vector } from "@mp/math";
import type { StateAccess } from "@mp/sync/server";
import type { TickEventHandler, TimeSpan } from "@mp/time";
import type { TiledClass } from "@mp/tiled-loader";
import type { AreaLookup } from "../modules/area/loadAreas";
import type { WorldState } from "../modules/world/WorldState";
import type { NPC, NPCId } from "../modules/npc/schema";

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

  const npcObjects = someArea.tiled.getObjectsByClassName("NPC" as TiledClass);
  const polylineObject = npcObjects.find((o) => o.objectType === "polyline");

  const polyline = polylineObject?.polyline.map((coord) =>
    someArea.tiled.worldCoordToTile(vec_add(polylineObject, coord)),
  );

  if (!polyline) {
    throw new Error("No NPC polyline");
  }

  accessState("initialize npcs", (state) => {
    for (let id = 0; id < 100; id++) {
      state.npcs[id] = {
        areaId: someArea.id,
        coords: polyline[id % polyline.length],
        id: id,
        speed: 1 + (id % 4),
        color: 0xff_00_00,
      };
    }
  });

  function isItTimeToMove(subject: NPC, totalTimeElapsed: TimeSpan): boolean {
    if (subject.path) {
      return false;
    }
    const subjectMemory = memory.get(subject.id);
    if (!subjectMemory) {
      return true;
    }
    const delta = totalTimeElapsed.subtract(
      subjectMemory.lastTimeMoved,
    ).totalSeconds;
    return delta >= 2;
  }

  function getDirection(subject: NPC) {
    return (memory.get(subject.id)?.numberOfMoves ?? 0) % 2;
  }

  function getDestination(subject: NPC): Vector {
    return vec_add(
      subject.coords,
      getDirection(subject) ? vec(-10, 0) : vec(10, 0),
    );
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
        someArea.findPath(subject.coords, getDestination(subject));

        if (isItTimeToMove(subject, totalTimeElapsed)) {
          subject.path = getDirection(subject)
            ? [...polyline]
            : [...polyline].reverse();
          memorizeMove(subject, totalTimeElapsed);
        }
      }
    });
  };
}

function reversePath(path: Path): Path {
  return [...path].reverse();
}
