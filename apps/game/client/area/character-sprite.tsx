import type { FrameObject, Size, SpritesheetFrameData, Texture } from "pixi.js";
import { AnimatedSprite, Assets, Spritesheet } from "pixi.js";
import { createEffect, createMemo } from "solid-js";
import spritesheetUrl from "../../../server/public/characters/sscary-the-male-adventurer/Walk/Normal/walk.png";

const frameSize: Size = { width: 48, height: 64 };

export function createCharacterSprite() {
  const textures = createMemo((): FrameObject[] =>
    (walk.animations["down"] ?? []).map((texture) => ({
      texture,
      time: 100,
    })),
  );

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
      (frame, frameIndex) => [frameIndex, frame],
    ),
  );
  const animations = Object.fromEntries(
    Object.entries(directionLayerIndexes).map(([name, rowIndex]) => [
      name,
      Array.from({ length: columns }, (v, columnIndex) =>
        String(rowIndex * columns + columnIndex),
      ),
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

const walk = await loadCharacterSpritesheet(spritesheetUrl, frameSize);
