import type { AnimatedSpriteFrames, Spritesheet } from "pixi.js";
import { AnimatedSprite } from "pixi.js";
import type { Accessor } from "solid-js";
import { createEffect, createMemo } from "solid-js";
import { nearestCardinalDirection } from "@mp/math";
import { characterSpriteDirections } from "./character-spritesheet";

export function createCharacterSprite(
  facingAngle: Accessor<number>,
  spritesheet: Accessor<Spritesheet>,
): AnimatedSprite {
  const direction = createMemo(() => {
    const availableDirections = characterSpriteDirections.filter(
      (direction) => spritesheet().animations[direction].length,
    );
    return nearestCardinalDirection(facingAngle(), availableDirections);
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
