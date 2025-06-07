import type { CardinalDirection } from "@mp/math";
import {
  cardinalDirections,
  cardinalDirectionAngles,
  nearestCardinalDirection,
  clamp,
} from "@mp/math";
import { TimeSpan } from "@mp/time";
import type { DestroyOptions, SpriteOptions, Spritesheet } from "pixi.js";
import { Ticker } from "pixi.js";
import { Sprite } from "pixi.js";
import { assert, createShortId } from "@mp/std";

/**
 * Selects a texture from a set of spritesheets based on a current animation name and cardinal direction.
 * Allows to smoothly switch between animations without resetting fram number, or replaying an entire animation from start to end.
 */
export class AnimationController<AnimationName extends string> extends Sprite {
  direction: CardinalDirection = "s";
  spritesheets = {} as ReadonlyMap<AnimationName, Spritesheet>;
  private animations: Animation<AnimationName>[] = [];
  private eventSubscriptions = new Set<AnimationEventHandler<AnimationName>>();

  get currentAnimationName(): AnimationName | undefined {
    return this.animations[0]?.name;
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
    const animation = this.animations[0] as
      | Animation<AnimationName>
      | undefined;

    if (!animation) {
      return;
    }

    const spritesheet = assert(this.spritesheets.get(animation.name));
    const compatibleDirection = spritesheetCompatibleDirection(
      this.direction,
      spritesheet,
    );

    const textures = assert(spritesheet.animations[compatibleDirection]);
    const frameTime = this.options.frameTime();

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

    const endTime = frameTime.multiply(textures.length);

    if (animation.currentTime.compareTo(endTime) > 0) {
      if (animation.loop) {
        animation.currentTime = TimeSpan.Zero;
      } else {
        this.animations.splice(0, 1);
      }
      this.emitAnimationEvent({ type: "complete", animation });
    }
  };

  switchAnimationSmoothly(name: AnimationName): void {
    const nextSmoothSwitchTarget = this.animations.find(
      (anim) => anim.type === "smooth-switch",
    );
    if (nextSmoothSwitchTarget) {
      nextSmoothSwitchTarget.name = name;
    } else {
      this.animations.push({
        id: createShortId(),
        type: "smooth-switch",
        name,
        currentTime: TimeSpan.Zero,
        loop: true,
      });
    }
  }

  async playToEndAndStop(name: AnimationName) {
    const animation: Animation<AnimationName> = {
      id: createShortId(),
      type: "play-to-end",
      name,
      currentTime: TimeSpan.Zero,
      loop: false,
    };

    this.animations = [animation];

    return new Promise<void>((resolve) => {
      const unsubscribe = this.subscribe((event) => {
        if (event.animation.id === animation.id) {
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

interface Animation<Name extends string> {
  id: string;
  type: "smooth-switch" | "play-to-end";
  name: Name;
  currentTime: TimeSpan;
  loop: boolean;
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
