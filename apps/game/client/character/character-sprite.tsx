import type { AnimatedSpriteFrames, Spritesheet } from "pixi.js";
import { AnimatedSprite } from "pixi.js";
import type { Accessor } from "solid-js";
import { createEffect, createMemo } from "solid-js";
import type { CharacterSpriteDirection } from "./character-spritesheet";
import { characterSpriteDirections } from "./character-spritesheet";

export function createCharacterSprite(
  facingAngle: Accessor<number>,
  spritesheet: Accessor<Spritesheet>,
): AnimatedSprite {
  const direction = createMemo(() => {
    const availableDirections = characterSpriteDirections.filter(
      (direction) => spritesheet().animations[direction].length,
    );
    return determineDirection(facingAngle(), availableDirections);
  });
  const textures = createMemo((): AnimatedSpriteFrames => {
    const textures = spritesheet().animations[direction()];
    return textures.map((texture) => ({
      texture,
      time: 100,
    }));
  });

  const sprite = new AnimatedSprite({
    width: 48,
    height: 64,
    anchor: { x: 0.5, y: 2 / 3 }, // 2/3 seems to be a consistent anchor point specifically for the adventurer sprite pack
    // eslint-disable-next-line solid/reactivity
    textures: textures(),
  });

  createEffect(() => {
    const previousFrame = sprite.currentFrame;
    sprite.textures = textures();
    sprite.gotoAndPlay(previousFrame);
  });

  return sprite;
}

function determineDirection(
  angle: number,
  availableDirections: CharacterSpriteDirection[],
): CharacterSpriteDirection {
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
