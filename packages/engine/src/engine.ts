import type { Size } from "@mp/math";
import { TimeSpan } from "@mp/time";
import { Camera } from "./camera";
import { PointerForCamera } from "./pointer";
import { Keyboard } from "./keyboard";

export class Engine {
  #previousFrame = performance.now();
  #isRunning = false;
  pointer: PointerForCamera;
  keyboard: Keyboard;
  #viewportSizeObserver?: ResizeObserver;
  #frameCallbacks = new Set<(deltaTime: TimeSpan) => void>();

  get frameCallbackCount() {
    return this.#frameCallbacks.size;
  }

  readonly camera: Camera;

  constructor(private readonly viewport: HTMLElement) {
    this.camera = new Camera(elementSize(viewport), 2, 3);
    this.pointer = new PointerForCamera(viewport, this.camera);
    this.keyboard = new Keyboard(window);
  }

  start() {
    this.pointer.start();
    this.keyboard.start();
    this.#isRunning = true;
    requestAnimationFrame(this.nextFrame);
    this.#viewportSizeObserver = new ResizeObserver(this.onViewportResized);
    this.#viewportSizeObserver.observe(this.viewport);
  }

  stop() {
    this.pointer.stop();
    this.keyboard.stop();
    this.#isRunning = false;
    this.#viewportSizeObserver?.disconnect();
    this.#viewportSizeObserver = undefined;
  }

  // Note: Explicit callback based frame reactivity because implicit
  // reactivity for rendering is error prone and hard to reason about.
  addFrameCallback(callback: (deltaTime: TimeSpan) => void) {
    this.#frameCallbacks.add(callback);
    return () => this.#frameCallbacks.delete(callback);
  }

  private nextFrame: FrameRequestCallback = () => {
    const thisFrame = performance.now();
    const deltaTime = TimeSpan.fromMilliseconds(
      thisFrame - this.#previousFrame,
    );
    this.#previousFrame = thisFrame;

    for (const callback of this.#frameCallbacks) {
      callback(deltaTime);
    }

    if (this.#isRunning) {
      requestAnimationFrame(this.nextFrame);
    }
  };

  private onViewportResized = () => {
    this.camera.cameraSize = elementSize(this.viewport);
  };
}

function elementSize(element: HTMLElement): Size {
  return {
    get width() {
      return element.clientWidth;
    },
    get height() {
      return element.clientHeight;
    },
  };
}
