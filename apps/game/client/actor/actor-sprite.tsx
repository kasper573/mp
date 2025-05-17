import type { FrameObject } from "pixi.js";
import { AnimatedSprite } from "pixi.js";
import type { Accessor } from "solid-js";
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
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
  desiredDirection: Accessor<CardinalDirection>,
): [AnimatedSprite, ActorSpriteCommands] {
  const [desiredState, setDesiredState] =
    createSignal<ActorModelState>("idle-normal");
  const [isAttacking, setIsAttacking] = createSignal(false);
  const allSpriteshets = useContext(ActorSpritesheetContext);
  const state = createMemo(() =>
    isAttacking() ? deriveAttackState(desiredState()) : desiredState(),
  );
  const spritesheet = createMemo(() =>
    assert(allSpriteshets.get(modelId())?.get(state())),
  );
  const direction = createMemo(() =>
    spritesheetCompatibleDirection(desiredDirection(), spritesheet()),
  );
  const textures = createMemo((): FrameObject[] => {
    const textures = spritesheet().animations[direction()];
    return textures.map((texture) => ({
      texture,
      time: 100, // TODO should come as metadata from the spritesheet
    }));
  });

  const duration = createMemo(() => textures().reduce((a, b) => a + b.time, 0));

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

  let lastTimeoutId: NodeJS.Timeout | undefined;

  function attack() {
    setIsAttacking(true);
    sprite.currentFrame = 0;
    clearTimeout(lastTimeoutId);
    lastTimeoutId = setTimeout(() => setIsAttacking(false), duration());
  }

  return [sprite, { setState: setDesiredState, attack }];
}

interface ActorSpriteCommands {
  setState: (state: ActorModelState) => void;
  attack: () => void;
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

function deriveAttackState(state: ActorModelState): ActorModelState {
  switch (state) {
    case "idle-gun":
    case "attack-shooting":
      return "attack-shooting";
    case "walk-gun":
    case "walk-reloading":
    case "walk-shooting":
      return "walk-shooting";
    case "jump-gun":
    case "dash-gun":
    case "run-gun":
    case "run-shooting":
      return "run-shooting";
    case "run-spear":
    case "dash-spear":
    case "jump-spear":
    case "walk-spear":
    case "attack-spear":
    case "idle-spear":
      return "attack-spear";
  }
  return state;
}
