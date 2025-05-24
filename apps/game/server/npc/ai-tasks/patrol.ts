import type { Path } from "@mp/math";
import type { Tile } from "@mp/std";
import type { Task } from "./task";

export function createPatrolTask(path: Path<Tile>): Task {
  let reversePath = false;
  return function patrol(input) {
    const { gameState, npc } = input;

    if (!npc.path) {
      const nextPath = reversePath ? path.toReversed() : path;
      reversePath = !reversePath;
      gameState.actors.update(npc.id, (update) => update.add("path", nextPath));
    }

    return patrol;
  };
}
