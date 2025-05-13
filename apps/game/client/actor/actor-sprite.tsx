import type { AnimatedSpriteFrames, Spritesheet } from "pixi.js";
import { AnimatedSprite } from "pixi.js";
import type { Accessor } from "solid-js";
import { createContext, createEffect, createMemo, useContext } from "solid-js";
import {
  cardinalDirectionAngles,
  cardinalDirections,
  nearestCardinalDirection,
  type CardinalDirection,
} from "@mp/math";
import { assert } from "@mp/std";
import {
  actorModelStates,
  type ActorModelId,
  type ActorModelState,
} from "../../server";

export function createActorSprite(
  modelId: Accessor<ActorModelId>,
  state: Accessor<ActorModelState>,
  desiredDirection: Accessor<CardinalDirection>,
): AnimatedSprite {
  const allSpriteshets = useContext(ActorSpritesheetContext);
  const spritesheet = createMemo(() =>
    assert(allSpriteshets.get(modelId())?.get(state())),
  );
  const direction = createMemo(() =>
    spritesheetCompatibleDirection(desiredDirection(), spritesheet()),
  );
  const textures = createMemo((): AnimatedSpriteFrames => {
    const textures = spritesheet().animations[direction()];
    return textures.map((texture) => ({
      texture,
      time: 100, // TODO should come as metadata from the spritesheet
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
    if (previousFrame <= sprite.textures.length) {
      sprite.gotoAndPlay(previousFrame);
    }
  });

  createEffect(() => {
    sprite.loop = loopedCharacterSpriteStates.has(state());
  });

  return sprite;
}

const loopedCharacterSpriteStates = new Set(
  actorModelStates.filter((state) => !state.startsWith("death-")),
);

/**
 * Since a spritesheet may not contain animations for every direction,
 * we need to provide a fallback direction in case the desired direction
 * is not available.
 */
function spritesheetCompatibleDirection(
  desiredDirection: CardinalDirection,
  spritesheet: Spritesheet,
): CardinalDirection {
  const availableDirections = cardinalDirections.filter(
    (direction) => spritesheet.animations[direction].length,
  );
  if (availableDirections.includes(desiredDirection)) {
    return desiredDirection;
  }
  const desiredAngle = cardinalDirectionAngles[desiredDirection];
  return nearestCardinalDirection(desiredAngle, availableDirections);
}

export const ActorSpritesheetContext = createContext(
  new Proxy(
    {} as ReadonlyMap<ActorModelId, ReadonlyMap<ActorModelState, Spritesheet>>,
    {
      get() {
        throw new Error("CharacterSpritesheetContext is not initialized");
      },
    },
  ),
);
