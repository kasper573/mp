import { TimeSpan } from "@mp/time";

export class FrameEmitter {
  #previousFrameTime = performance.now();
  #previousFrameDuration = TimeSpan.Zero;
  #isRunning = false;
  #frameCallbacks = new Set<FrameCallback>();

  get callbackCount(): number {
    return this.#frameCallbacks.size;
  }

  subscribe(callback: FrameCallback): UnsubscribeFromFrames {
    this.#frameCallbacks.add(callback);
    return () => this.#frameCallbacks.delete(callback);
  }

  stop(): void {
    this.#isRunning = false;
  }

  start() {
    if (!this.#isRunning) {
      this.#isRunning = true;
      requestAnimationFrame(this.nextFrame);
    }

    return () => this.stop();
  }

  private nextFrame: FrameRequestCallback = () => {
    const thisFrameTime = performance.now();
    const timeSinceLastFrame = TimeSpan.fromMilliseconds(
      thisFrameTime - this.#previousFrameTime,
    );
    this.#previousFrameTime = thisFrameTime;
    const currentTime = new Date(thisFrameTime);
    const opt: FrameCallbackOptions = {
      timeSinceLastFrame,
      currentTime,
      previousFrameDuration: this.#previousFrameDuration,
    };

    for (const callback of this.#frameCallbacks) {
      callback(opt);
    }

    this.#previousFrameDuration = TimeSpan.fromMilliseconds(
      performance.now() - thisFrameTime,
    );

    if (this.#isRunning) {
      requestAnimationFrame(this.nextFrame);
    }
  };
}

export type UnsubscribeFromFrames = () => void;

export type FrameCallback = (opt: FrameCallbackOptions) => unknown;

export interface FrameCallbackOptions {
  timeSinceLastFrame: TimeSpan;
  previousFrameDuration: TimeSpan;
  currentTime: Date;
}
