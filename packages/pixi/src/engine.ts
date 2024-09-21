import { Vector, Camera } from "@mp/math";
import { TimeSpan } from "@mp/time";
import { createHeldKeysInterface } from "./heldKeys";

export class Engine {
  public static instance: Engine;

  public camera: Camera;

  private tickIntervalId?: NodeJS.Timeout;

  static replace(viewport: HTMLCanvasElement) {
    if (Engine.instance) {
      Engine.instance.stop();
    }

    Engine.instance = new Engine(viewport);
    Engine.instance.start();
  }

  private heldKeys = createHeldKeysInterface<KeyName>();
  private previousFrame = performance.now();
  private isRunning = false;

  ticker = {
    deltaTime: TimeSpan.fromMilliseconds(0),
  };

  input = {
    pointer: {
      lastViewportPosition: new Vector(0, 0),
      lastWorldPosition: new Vector(0, 0),
      isDown: false,
    },
    keyboard: {
      heldKeys: this.heldKeys.signal,
      isHeld: (key: KeyName) => this.heldKeys.signal.value.has(key),
      subscribe: (key: KeyName, callback: (isDown: boolean) => void) => {
        return this.heldKeys.signal.subscribe((keys) => {
          callback(keys.has(key));
        });
      },
    },
  };

  private constructor(private viewport: HTMLCanvasElement) {
    this.camera = new Camera(viewport);
  }

  private nextFrame: FrameRequestCallback = () => {
    const thisFrame = performance.now();
    const deltaTime = TimeSpan.fromMilliseconds(thisFrame - this.previousFrame);
    this.previousFrame = thisFrame;
    this.ticker.deltaTime = deltaTime;

    if (this.isRunning) {
      requestAnimationFrame(this.nextFrame);
    }
  };

  private start() {
    this.heldKeys.start();
    this.viewport.addEventListener("pointermove", this.onPointerMove);
    this.viewport.addEventListener("pointerdown", this.onPointerDown);
    this.viewport.addEventListener("pointerup", this.onPointerUp);
    this.tickIntervalId = setInterval(this.onTick, 1000 / 60);

    this.isRunning = true;
    requestAnimationFrame(this.nextFrame);
  }

  stop() {
    this.heldKeys.stop();
    this.viewport.addEventListener("pointermove", this.onPointerMove);
    this.viewport.addEventListener("pointerdown", this.onPointerDown);
    this.viewport.addEventListener("pointerup", this.onPointerUp);
    clearInterval(this.tickIntervalId);
  }

  private onPointerMove = (e: PointerEvent) => {
    this.input.pointer.lastViewportPosition = new Vector(e.offsetX, e.offsetY);
  };

  private onPointerDown = () => (this.input.pointer.isDown = true);
  private onPointerUp = () => (this.input.pointer.isDown = false);

  private onTick = () => {
    this.input.pointer.lastWorldPosition = this.camera.screenToWorld(
      this.input.pointer.lastViewportPosition,
    );
  };
}

export type KeyName = "Shift" | "Control";
