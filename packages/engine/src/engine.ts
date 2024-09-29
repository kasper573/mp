import type { Size } from "@mp/math";
import { TimeSpan } from "@mp/time";
import { atom } from "@mp/state";
import { Camera } from "./camera";
import { PointerForCamera } from "./pointer";
import { Keyboard } from "./keyboard";

export class Engine {
  #previousFrame = performance.now();
  #isRunning = false;
  #deltaTime = atom(TimeSpan.fromMilliseconds(0));
  pointer: PointerForCamera;
  keyboard: Keyboard;
  #viewportSizeObserver?: ResizeObserver;

  readonly camera: Camera;
  get deltaTime(): TimeSpan {
    return this.#deltaTime.get();
  }

  constructor(private readonly viewport: HTMLElement) {
    this.camera = new Camera(elementSize(viewport), 2, 3);
    this.pointer = new PointerForCamera(viewport, this.camera);
    this.keyboard = new Keyboard();
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

  private nextFrame: FrameRequestCallback = () => {
    const thisFrame = performance.now();
    const deltaTime = TimeSpan.fromMilliseconds(
      thisFrame - this.#previousFrame,
    );
    this.#previousFrame = thisFrame;
    this.#deltaTime.set(deltaTime);

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
