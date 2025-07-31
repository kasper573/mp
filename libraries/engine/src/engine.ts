import { Vector } from "@mp/math";
import type { Pixel } from "@mp/std";
import { Camera } from "./camera";
import { PointerForCamera } from "./pointer";
import { Keyboard } from "./keyboard";
import { FrameEmitter } from "./frame-emitter";

export class Engine {
  #isInteractive = false;
  #viewportSizeObserver?: ResizeObserver;
  frameEmitter = new FrameEmitter();
  pointer: PointerForCamera;
  keyboard: Keyboard;

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
    this.frameEmitter.start();
    this.#viewportSizeObserver = new ResizeObserver(this.onViewportResized);
    this.#viewportSizeObserver.observe(this.viewport);

    // Return cleanup function for easy integration with effects
    return () => this.stop();
  };

  stop = () => {
    this.pointer.stop();
    this.keyboard.stop();
    this.frameEmitter.stop();
    this.#viewportSizeObserver?.disconnect();
    this.#viewportSizeObserver = undefined;
  };

  private onViewportResized = () => {
    this.camera.cameraSize.value = elementSize(this.viewport);
  };
}

function elementSize(element: HTMLElement): Vector<Pixel> {
  return new Vector(
    element.clientWidth as Pixel,
    element.clientHeight as Pixel,
  );
}
