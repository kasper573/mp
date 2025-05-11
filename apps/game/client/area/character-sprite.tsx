import type {
  AnimatedSpriteFrames,
  Size,
  SpritesheetFrameData,
  Texture,
} from "pixi.js";
import { AnimatedSprite, Assets, Spritesheet } from "pixi.js";
import type { Accessor } from "solid-js";
import { createEffect, createMemo } from "solid-js";
import spritesheetUrl from "../../../server/public/characters/sscary-the-male-adventurer/Run/Normal/run.png";
import missingUrl from "./missing.jpg";

const frameSize: Size = { width: 48, height: 64 };

const missingTexture = await Assets.load<Texture>(missingUrl);

export function createCharacterSprite(facingAngle: Accessor<number>) {
  const direction = createMemo(() => {
    const availableDirections = allDirections.filter(
      (direction) => spritesheet.animations[direction].length,
    );
    return determineDirection(facingAngle(), availableDirections);
  });
  const textures = createMemo((): AnimatedSpriteFrames => {
    const textures = spritesheet.animations[direction()] as
      | Texture[]
      | undefined;
    if (!textures?.length) {
      return [missingTexture];
    }
    return textures.map((texture) => ({
      texture,
      time: 100,
    }));
  });

  const sprite = new AnimatedSprite({
    ...frameSize,
    anchor: { x: 0.5, y: 0.5 },
    // eslint-disable-next-line solid/reactivity
    textures: textures(),
  });

  createEffect(() => {
    sprite.textures = textures();
    sprite.play();
  });

  return sprite;
}

async function loadCharacterSpritesheet(
  url: string,
  frameSize: Size,
): Promise<Spritesheet> {
  const texture = await Assets.load<Texture>(url);
  texture.source.scaleMode = "nearest";
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
      image: url,
      size: { w: texture.width, h: texture.height },
      scale: 1,
    },
    animations,
  });

  await ss.parse();

  return ss;
}

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

function determineDirection(
  angle: number,
  availableDirections: Direction[],
): Direction {
  const normalizedAngle = normalizeAngle(angle);
  const nearestDirections = availableDirections.toSorted(
    (directionA, directionB) => {
      const daAngle = normalizeAngle(directionAngles[directionA]);
      const dbAngle = normalizeAngle(directionAngles[directionB]);
      return (
        Math.abs(normalizedAngle - daAngle) -
        Math.abs(normalizedAngle - dbAngle)
      );
    },
  );

  return nearestDirections[0];
}

export type Direction = keyof typeof directionAngles;

/**
 * The exact angle that each direction represents.
 */
export const directionAngles = {
  right: Math.atan2(0, 1),
  "down-right": Math.atan2(1, 1),
  down: Math.atan2(1, 0),
  "down-left": Math.atan2(1, -1),
  left: Math.atan2(0, -1),
  "up-left": Math.atan2(-1, -1),
  up: Math.atan2(-1, 0),
  "up-right": Math.atan2(-1, 1),
};

function normalizeAngle(angle: number) {
  if (angle < 0) {
    return angle + 2 * Math.PI;
  }
  return angle;
}

const allDirections = Object.keys(directionAngles) as Direction[];

/**
 * The layer index inside the spritesheet each direction is located at.
 */
const directionLayerIndexes: Record<Direction, number> = {
  down: 0,
  "down-left": 1,
  "up-left": 2,
  up: 3,
  "up-right": 4,
  "down-right": 5,
  right: 6,
  left: 7,
};

const spritesheet = await loadCharacterSpritesheet(spritesheetUrl, frameSize);
