import { clamp } from "@mp/math";
import type { FrameObject, SpriteOptions } from "pixi.js";
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
  private strategy: FrameStrategy;

  constructor(private options: AutoplayAnimatedSpriteOptions) {
    super(options);
    this.strategy = determineFrameStrategy(options.frames);
    this.onRender = this.#onRender;
  }

  #onRender = () => {
    const currentTime = performance.now() % this.strategy.durationMs;
    const currentFrame = this.strategy.currentFrame(currentTime);
    this.texture = this.options.frames[currentFrame].texture;
  };
}

interface FrameStrategy {
  currentFrame: (currentTimeMs: number) => number;
  readonly durationMs: number;
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
  const durationMs = frameTimeMs * frameCount;
  return {
    currentFrame(currentTimeMs) {
      return clamp(Math.floor(currentTimeMs / frameTimeMs), 0, frameCount - 1);
    },
    durationMs,
  };
}

function unevenDistributionStrategy(frames: FrameObject[]): FrameStrategy {
  const durationMs = frames.reduce((sum, frame) => sum + frame.time, 0);
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
    durationMs,
  };
}
