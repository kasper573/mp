import type { Tile } from "@mp/std";
import { Vector } from "@mp/math";
import { TimeSpan } from "@mp/time";
import { q16, object, transform, u32 } from "@rift/types";
import type { RiftType } from "@rift/types";

// Object-shaped inner so `.x`/`.y` are independently addressable by the
// fieldmask encoder; transform layer surfaces a Vector to callers. Tiles
// are quantized to i16 with a fixed 1/256 sub-tile resolution: per-axis
// wire bytes drop from 4 (f32) to 2, halving the dominant Movement
// payload. Encodable range is ±128 tiles, comfortably above the current
// 45×31 fixture map.
const TILE_SUBSCALE = 256;
// Largest tile coordinate that `TileVector` can losslessly round-trip
// before fixedI16(256) saturates: 0x7fff / 256 ≈ 127.996. Consumers that
// load map data should range-check against this so a too-large map fails
// at load time rather than as a wire-encode error mid-tick.
export const TILE_COORD_MAX = 0x7fff / TILE_SUBSCALE;
export const TileVector: RiftType<Vector<Tile>> = transform(
  object({
    x: q16<Tile>(TILE_SUBSCALE),
    y: q16<Tile>(TILE_SUBSCALE),
  }),
  ({ x, y }) => new Vector(x, y),
  (v) => ({ x: v.x, y: v.y }),
);

export const TimeSpanType: RiftType<TimeSpan> = transform(
  u32(),
  (ms) => TimeSpan.fromMilliseconds(ms),
  (t) => t.totalMilliseconds >>> 0,
);
