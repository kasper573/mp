import { clamp } from "@mp/math";
import type { FrameObject, SpriteOptions } from "pixi.js";
import { Ticker } from "pixi.js";
import { Sprite } from "pixi.js";

export interface AutoplayAnimatedSpriteOptions
  extends Omit<SpriteOptions, "texture"> {
  frames: FrameObject[];
}

/**
 * A more performant version of AnimatedSprite that
 * always plays and loops without any ability to pause or stop.
 */
export class AutoplayAnimatedSprite extends Sprite {
  private currentTimeMs = 0;
  private previousFrame = 0;
  private strategy: FrameStrategy;

  constructor(private options: AutoplayAnimatedSpriteOptions) {
    super(options);
    this.strategy = determineFrameStrategy(options.frames);
    this.onRender = this.#onRender;
  }

  #onRender = () => {
    this.currentTimeMs += Ticker.shared.deltaMS;

    const currentFrame = this.strategy.currentFrame(this.currentTimeMs);
    if (currentFrame !== this.previousFrame) {
      this.texture = this.options.frames[currentFrame].texture;
      this.previousFrame = currentFrame;
    }

    if (this.currentTimeMs >= this.strategy.endTimeMs) {
      this.currentTimeMs = 0;
    }
  };
}

interface FrameStrategy {
  currentFrame: (currentTimeMs: number) => number;
  readonly endTimeMs: number;
}

function determineFrameStrategy(frames: FrameObject[]): FrameStrategy {
  const firstFrameTimeMs = frames[0].time;
  const isEvenDistribution = frames.every(
    (frame) => frame.time === firstFrameTimeMs,
  );
  if (isEvenDistribution) {
    return evenDistributionStrategy(frames.length, firstFrameTimeMs);
  }
  return unevenDistributionStrategy(frames);
}

function evenDistributionStrategy(
  frameCount: number,
  frameTimeMs: number,
): FrameStrategy {
  const endTimeMs = frameTimeMs * frameCount;
  return {
    currentFrame(currentTimeMs) {
      return clamp(Math.floor(currentTimeMs / frameTimeMs), 0, frameCount - 1);
    },
    endTimeMs,
  };
}

function unevenDistributionStrategy(frames: FrameObject[]): FrameStrategy {
  const endTimeMs = frames.reduce((sum, frame) => sum + frame.time, 0);
  return {
    currentFrame(currentTimeMs) {
      let totalMS = 0;
      for (const [index, frame] of frames.entries()) {
        totalMS += frame.time;
        if (currentTimeMs < totalMS) {
          return index;
        }
      }
      return frames.length - 1;
    },
    endTimeMs,
  };
}
