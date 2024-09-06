import { Vector } from "@mp/math";
import { TimeSpan } from "@mp/state";
import type { Application, FederatedPointerEvent } from "@mp/pixi";
import { Camera } from "./camera";

export class Engine {
  public static instance: Engine;

  public camera: Camera;

  static replace(app: Application) {
    if (Engine.instance) {
      Engine.instance.stop();
    }

    Engine.instance = new Engine(app);
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
      lastScreenPosition: new Vector(0, 0),
      lastWorldPosition: new Vector(0, 0),
      isDown: false,
    },
    keyboard: {
      isHeld: (key: KeyName) => this.heldKeys.has(key),
      subscribe: subscribeToKey,
    },
  };

  private constructor(private app: Application) {
    this.camera = new Camera(app.canvas);
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
    this.app.stage.on("pointermove", this.onPointerMove);
    this.app.stage.on("pointerdown", this.onPointerDown);
    this.app.stage.on("pointerup", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    this.isRunning = true;
    requestAnimationFrame(this.nextFrame);
  }

  private stop() {
    this.app.stage.off("pointermove", this.onPointerMove);
    this.app.stage.off("pointerdown", this.onPointerDown);
    this.app.stage.off("pointerup", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private onPointerMove = (e: FederatedPointerEvent) => {
    this.input.pointer.lastScreenPosition = new Vector(e.clientX, e.clientY);
    this.input.pointer.lastWorldPosition = this.camera.screenToWorld(
      this.input.pointer.lastScreenPosition,
    );
  };

  private onPointerDown = () => (this.input.pointer.isDown = true);
  private onPointerUp = () => (this.input.pointer.isDown = false);

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
