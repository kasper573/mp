import type { Size, Texture, SpritesheetFrameData } from "pixi.js";
import { Spritesheet } from "pixi.js";

// TODO strict spritesheet types for character spritesheets

// export type TiledSpritesheet = Spritesheet<TiledSpritesheetData>;

// export type TiledSpritesheetData = Omit<SpritesheetData, "frames"> & {
//   frames: Record<GlobalTileId, SpritesheetFrameData>;
//   animationsWithDuration?: Map<
//     GlobalTileId,
//     Array<{ duration: Milliseconds; id: GlobalTileId }>
//   >;
// };

export async function createCharacterSpritesheet(
  texture: Texture,
  frameSize: Size,
): Promise<Spritesheet> {
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
  );
  const ss = new Spritesheet(texture, {
    frames,
    meta: {
      size: { w: texture.width, h: texture.height },
      scale: 1,
    },
    animations,
  });

  await ss.parse();

  return ss;
}

export type CharacterSpriteDirection = keyof typeof directionLayerIndexes;

/**
 * The layer index inside the spritesheet each direction is located at.
 */
const directionLayerIndexes = {
  down: 0,
  "down-left": 1,
  "up-left": 2,
  up: 3,
  "up-right": 4,
  "down-right": 5,
  right: 6,
  left: 7,
};

export const characterSpriteDirections = Object.freeze(
  Object.keys(directionLayerIndexes),
) as ReadonlyArray<CharacterSpriteDirection>;

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
