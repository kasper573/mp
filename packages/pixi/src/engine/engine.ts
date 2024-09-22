import { Camera } from "@mp/math";
import { TimeSpan } from "@mp/time";
import { PointerForCamera } from "./pointer";
import { Keyboard } from "./keyboard";

export class Engine {
  #previousFrame = performance.now();
  #isRunning = false;
  #deltaTime = TimeSpan.fromMilliseconds(0);
  pointer: PointerForCamera;
  keyboard: Keyboard;

  readonly camera: Camera;
  get deltaTime(): TimeSpan {
    return this.#deltaTime;
  }

  constructor(viewport: HTMLCanvasElement) {
    this.camera = new Camera(viewport);
    this.pointer = new PointerForCamera(viewport, this.camera);
    this.keyboard = new Keyboard();
  }

  start() {
    this.pointer.start();
    this.keyboard.start();
    this.#isRunning = true;
    requestAnimationFrame(this.nextFrame);
  }

  stop() {
    this.pointer.stop();
    this.keyboard.stop();
    this.#isRunning = false;
  }

  private nextFrame: FrameRequestCallback = () => {
    const thisFrame = performance.now();
    const deltaTime = TimeSpan.fromMilliseconds(
      thisFrame - this.#previousFrame,
    );
    this.#previousFrame = thisFrame;
    this.#deltaTime = deltaTime;

    if (this.#isRunning) {
      requestAnimationFrame(this.nextFrame);
    }
  };
}
