import { Vector, Camera } from "@mp/math";
import { TimeSpan } from "@mp/time";

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

  private heldKeys = new Set<KeyName>();
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
      isHeld: (key: KeyName) => this.heldKeys.has(key),
      subscribe: subscribeToKey,
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
    this.viewport.addEventListener("pointermove", this.onPointerMove);
    this.viewport.addEventListener("pointerdown", this.onPointerDown);
    this.viewport.addEventListener("pointerup", this.onPointerUp);
    this.tickIntervalId = setInterval(this.onTick, 1000 / 60);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    this.isRunning = true;
    requestAnimationFrame(this.nextFrame);
  }

  stop() {
    this.viewport.addEventListener("pointermove", this.onPointerMove);
    this.viewport.addEventListener("pointerdown", this.onPointerDown);
    this.viewport.addEventListener("pointerup", this.onPointerUp);
    clearInterval(this.tickIntervalId);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
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

  private onKeyDown = (e: KeyboardEvent) => {
    this.heldKeys.add(e.key as KeyName);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.heldKeys.delete(e.key as KeyName);
  };
}

function subscribeToKey(key: KeyName, callback: (isHeld: boolean) => void) {
  let isHeld = false;
  const onDown = (e: KeyboardEvent) => {
    if (e.key === key && !isHeld) {
      isHeld = true;
      callback(true);
    }
  };
  const onUp = (e: KeyboardEvent) => {
    if (e.key === key && isHeld) {
      isHeld = false;
      callback(false);
    }
  };
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  return () => {
    window.removeEventListener("keydown", onDown);
    window.removeEventListener("keyup", onUp);
  };
}

export type KeyName = "Shift" | "Control";
