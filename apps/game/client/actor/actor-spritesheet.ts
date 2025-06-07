import type { CardinalDirection } from "@mp/math";
import type { TiledSpritesheetData } from "@mp/tiled-renderer";
import type {
  Size,
  Texture,
  SpritesheetFrameData,
  SpritesheetData,
} from "pixi.js";
import { Spritesheet } from "pixi.js";
import type { ActorAnimationName } from "../../server";

export type ActorSpritesheet = Spritesheet<TiledSpritesheetData>;

export type ActorSpritesheetData = Omit<SpritesheetData, "animations"> & {
  animations?: {
    [K in ActorAnimationName]: string[];
  };
};

export function createActorSpritesheet(
  texture: Texture,
  frameSize: Size,
): ActorSpritesheet {
  const columns = Math.ceil(texture.width / frameSize.width);
  const rows = Math.ceil(texture.height / frameSize.height);
  const frames = Object.fromEntries(
    Array.from(generateFrames(rows, columns, frameSize)).map(
      (frame, frameId) => [frameId, frame],
    ),
  );
  const animations = Object.fromEntries(
    Object.entries(directionLayerIndexes).map(([name, rowIndex]) => [
      name,
      Array.from({ length: columns }, (v, columnIndex) =>
        String(rowIndex * columns + columnIndex),
      ).filter((frameId) => frameId in frames),
    ]),
  ) as ActorSpritesheetData["animations"];

  return new Spritesheet(texture, {
    frames,
    meta: {
      size: { w: texture.width, h: texture.height },
      scale: 1,
    },
    animations,
  });
}

/**
 * The layer index inside the spritesheet each direction is located at.
 */
const directionLayerIndexes: Record<CardinalDirection, number> = {
  s: 0,
  sw: 1,
  nw: 2,
  n: 3,
  ne: 4,
  se: 5,
  e: 6,
  w: 7,
};

function* generateFrames(
  rows: number,
  columns: number,
  { width: w, height: h }: Size,
): Generator<SpritesheetFrameData> {
  for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
    for (let columnIndex = 0; columnIndex < columns; columnIndex++) {
      const x = columnIndex * w;
      const y = rowIndex * h;
      yield {
        frame: { x, y, w, h },
        spriteSourceSize: { x: 0, y: 0, w, h },
        sourceSize: { w, h },
      };
    }
  }
}
