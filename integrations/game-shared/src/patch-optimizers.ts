import type { Path, Vector } from "@mp/math";
import { isPathEqual } from "@mp/math";
import type { Tile } from "@mp/std";
import type { TrackedPropertyOptimizer } from "@mp/sync";

export const coords: TrackedPropertyOptimizer<Vector<Tile>> = {
  filter: (newValue, oldValue) =>
    // Since the client lerps coords along its current path we don't need to
    // send actual coordinate updates at a high frequency, so only sending
    // the new value when it's a new integer value is a good enough frequency.
    // It's a bit unsafe since we rely on coords always converging on a whole number,
    // but the movement system should always ensure that, so it's fine.
    !newValue.round().equals(oldValue.round()) ||
    // If we go from fraction to whole number that means we may have stopped at a location,
    // in which case the clients will need the new exact tile coordinate.
    (!newValue.isFraction(0.01) && oldValue.isFraction(0.01)),
};

// The client never need to see the whole path, just enough to do lerping
export const path: TrackedPropertyOptimizer<Path<Tile> | undefined> = {
  transform: (value) => value?.slice(0, 2),
  filter: (a, b) => !isPathEqual(a, b),
};
