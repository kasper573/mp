import type { AnimatedSpriteFrames } from "pixi.js";
import { AnimatedSprite } from "pixi.js";
import type { Accessor } from "solid-js";
import {
  createContext,
  createEffect,
  createMemo,
  untrack,
  useContext,
} from "solid-js";
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
import type { ActorSpritesheet } from "./actor-spritesheet";

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

  const spriteFlags = createMemo(() => actorSpriteFlags[state()]);

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
    const { retainFrameNumber } = untrack(spriteFlags);
    if (retainFrameNumber && previousFrame <= sprite.textures.length) {
      sprite.gotoAndPlay(previousFrame);
    } else {
      sprite.gotoAndPlay(0);
    }
  });

  createEffect(() => {
    sprite.loop = spriteFlags().loop;
  });

  return sprite;
}

interface ActorSpriteStateFlag {
  /**
   * If true, the animation will loop.
   */
  loop: boolean;
  /**
   * When the animation is switched to, the previous frame number is retained.
   * This is useful for animations that are designed to line up with each other,
   */
  retainFrameNumber: boolean;
}

const actorSpriteFlags = {} as Record<ActorModelState, ActorSpriteStateFlag>;

for (const state of actorModelStates) {
  if (state.startsWith("death-")) {
    actorSpriteFlags[state] = {
      loop: false,
      retainFrameNumber: false,
    };
  } else {
    actorSpriteFlags[state] = {
      loop: true,
      retainFrameNumber: true,
    };
  }
}

/**
 * Since a spritesheet may not contain animations for every direction,
 * we need to provide a fallback direction in case the desired direction
 * is not available.
 */
function spritesheetCompatibleDirection(
  desiredDirection: CardinalDirection,
  spritesheet: ActorSpritesheet,
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
    {} as ReadonlyMap<
      ActorModelId,
      ReadonlyMap<ActorModelState, ActorSpritesheet>
    >,
    {
      get() {
        throw new Error("CharacterSpritesheetContext is not initialized");
      },
    },
  ),
);
