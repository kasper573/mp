import type { CardinalDirection } from "@mp/math";
import {
  cardinalDirections,
  cardinalDirectionAngles,
  nearestCardinalDirection,
  clamp,
} from "@mp/math";
import { TimeSpan } from "@mp/time";
import type {
  DestroyOptions,
  SpriteOptions,
  Spritesheet,
  Texture,
} from "pixi.js";
import { Ticker } from "pixi.js";
import { Sprite } from "pixi.js";
import { assert } from "@mp/std";

/**
 * Selects a texture from a set of spritesheets based on a current animation name and cardinal direction.
 * Allows to smoothly switch between animations without resetting fram number, or replaying an entire animation from start to end.
 */
export class AnimationController<AnimationName extends string> extends Sprite {
  private eventSubscriptions = new Set<AnimationEventHandler<AnimationName>>();

  protected smooth?: SmoothSwitchAnimation<AnimationName>;
  protected fixed?: FixedAtEndAnimation<AnimationName>;
  protected playToEnd?: PlayToEndAnimation<AnimationName>;

  direction: CardinalDirection = "s";
  spritesheets = {} as ReadonlyMap<AnimationName, Spritesheet>;

  get animation(): Animation<AnimationName> | undefined {
    return this.fixed ?? this.playToEnd ?? this.smooth;
  }

  get currentAnimationName(): AnimationName | undefined {
    return this.animation?.name;
  }

  constructor(private options: AnimationControllerOptions) {
    super(options);

    Ticker.shared.add(this.update, this);
  }

  subscribe(handler: AnimationEventHandler<AnimationName>) {
    this.eventSubscriptions.add(handler);
    return () => this.eventSubscriptions.delete(handler);
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);

    Ticker.shared.remove(this.update, this);
  }

  private update = (ticker: Ticker) => {
    const { animation } = this;

    if (!animation) {
      return;
    }

    const spritesheet = assert(this.spritesheets.get(animation.name));
    const compatibleDirection = spritesheetCompatibleDirection(
      this.direction,
      spritesheet,
    );

    const textures = assert(spritesheet.animations[compatibleDirection]);

    if (animation.type === "fixed-at-end") {
      this.texture = textures.at(-1) as Texture;
      return;
    }

    const frameTime = this.options.frameTime();
    const endTime = frameTime.multiply(textures.length);
    animation.currentTime = animation.currentTime.add(
      TimeSpan.fromMilliseconds(ticker.deltaMS),
    );

    const currentFrame = clamp(
      Math.floor(
        animation.currentTime.totalMilliseconds / frameTime.totalMilliseconds,
      ),
      0,
      textures.length - 1,
    );

    this.texture = textures[currentFrame];

    if (animation.currentTime.compareTo(endTime) > 0) {
      switch (animation.type) {
        case "smooth-switch":
          // Smooth switch animations should loop
          animation.currentTime = TimeSpan.Zero;
          break;
        case "play-to-end":
          delete this.playToEnd;
          break;
      }
      this.emitAnimationEvent({ type: "complete", animation });
    }
  };

  switchAnimationSmoothly(name: AnimationName): void {
    delete this.fixed;
    if (this.smooth) {
      this.smooth.name = name;
    } else {
      this.smooth = {
        type: "smooth-switch",
        name,
        currentTime: TimeSpan.Zero,
      };
    }
  }

  async playToEndAndStop(name: AnimationName) {
    delete this.fixed;
    delete this.smooth;

    const thisAnimation: PlayToEndAnimation<AnimationName> = {
      type: "play-to-end",
      name,
      currentTime: TimeSpan.Zero,
    };

    this.playToEnd = thisAnimation;

    return new Promise<void>((resolve) => {
      const unsubscribe = this.subscribe((event) => {
        if (event.animation === thisAnimation) {
          unsubscribe();
          resolve();
        }
      });
    });
  }

  private emitAnimationEvent(event: AnimationEvent<AnimationName>) {
    for (const handler of this.eventSubscriptions) {
      handler(event);
    }
  }
}

interface AnimationControllerOptions extends SpriteOptions {
  frameTime: () => TimeSpan;
}

export type Animation<Name extends string> =
  | SmoothSwitchAnimation<Name>
  | PlayToEndAnimation<Name>
  | FixedAtEndAnimation<Name>;

export interface SmoothSwitchAnimation<Name extends string> {
  type: "smooth-switch";
  name: Name;
  currentTime: TimeSpan;
}

export interface PlayToEndAnimation<Name extends string> {
  type: "play-to-end";
  name: Name;
  currentTime: TimeSpan;
}

export interface FixedAtEndAnimation<Name extends string> {
  type: "fixed-at-end";
  name: Name;
}

interface AnimationEvent<AnimationName extends string> {
  type: "complete";
  animation: Animation<AnimationName>;
}

type AnimationEventHandler<AnimationName extends string> = (
  event: AnimationEvent<AnimationName>,
) => unknown;

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
