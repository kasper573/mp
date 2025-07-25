import type { Path } from "@mp/math";
import type { Tile } from "@mp/std";
import type { Task } from "./task";

export function createPatrolTask(path: Path<Tile>): Task {
  let reversePath = false;
  return function patrol(context, npc) {
    if (!npc.path) {
      const nextPath = reversePath ? path.toReversed() : path;
      reversePath = !reversePath;
      npc.path = nextPath;
    }

    return patrol;
  };
}
