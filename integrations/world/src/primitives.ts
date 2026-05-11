import type { Tile } from "@mp/std";
import { Vector } from "@mp/math";
import { TimeSpan } from "@mp/time";
import { f32, object, transform, u32 } from "@rift/types";
import type { RiftType } from "@rift/types";

// Object-shaped inner so `.x`/`.y` are independently addressable by the
// fieldmask encoder; transform layer surfaces a Vector to callers.
export const TileVector: RiftType<Vector<Tile>> = transform(
  object({
    x: f32<Tile>(),
    y: f32<Tile>(),
  }),
  ({ x, y }) => new Vector(x, y),
  (v) => ({ x: v.x, y: v.y }),
);

export const TimeSpanType: RiftType<TimeSpan> = transform(
  u32(),
  (ms) => TimeSpan.fromMilliseconds(ms),
  (t) => t.totalMilliseconds >>> 0,
);
