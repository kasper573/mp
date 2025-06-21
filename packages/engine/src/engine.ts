import { TimeSpan } from "@mp/time";
import { Vector } from "@mp/math";
import type { Pixel } from "@mp/std";
import { Camera } from "./camera";
import { PointerForCamera } from "./pointer";
import { Keyboard } from "./keyboard";

export class Engine {
  #previousFrameTime = performance.now();
  #previousFrameDuration = TimeSpan.Zero;
  #isRunning = false;
  #isInteractive = false;
  pointer: PointerForCamera;
  keyboard: Keyboard;
  #viewportSizeObserver?: ResizeObserver;
  #frameCallbacks = new Set<FrameCallback>();

  get frameCallbackCount() {
    return this.#frameCallbacks.size;
  }

  get isInteractive() {
    return this.#isInteractive;
  }

  readonly camera: Camera;

  constructor(private readonly viewport: HTMLElement) {
    this.camera = new Camera(elementSize(viewport));
    this.pointer = new PointerForCamera(viewport, this.camera);
    this.keyboard = new Keyboard(window);
  }

  start = (interactive: boolean) => {
    this.#isInteractive = interactive;
    if (interactive) {
      this.pointer.start();
      this.keyboard.start();
    }
    this.#isRunning = true;
    requestAnimationFrame(this.nextFrame);
    this.#viewportSizeObserver = new ResizeObserver(this.onViewportResized);
    this.#viewportSizeObserver.observe(this.viewport);
  };

  stop = () => {
    this.pointer.stop();
    this.keyboard.stop();
    this.#isRunning = false;
    this.#viewportSizeObserver?.disconnect();
    this.#viewportSizeObserver = undefined;
  };

  // Note: Explicit callback based frame reactivity because implicit
  // reactivity for rendering is error prone and hard to reason about.
  addFrameCallback(callback: FrameCallback) {
    this.#frameCallbacks.add(callback);
    return () => this.#frameCallbacks.delete(callback);
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

  private onViewportResized = () => {
    this.camera.cameraSize = elementSize(this.viewport);
  };
}

function elementSize(element: HTMLElement): Vector<Pixel> {
  return new Vector(
    element.clientWidth as Pixel,
    element.clientHeight as Pixel,
  );
}

export type FrameCallback = (opt: FrameCallbackOptions) => unknown;

export interface FrameCallbackOptions {
  timeSinceLastFrame: TimeSpan;
  previousFrameDuration: TimeSpan;
  currentTime: Date;
}
