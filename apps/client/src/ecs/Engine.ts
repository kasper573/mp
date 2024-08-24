import { Vector } from "@mp/math";
import { TimeSpan } from "@mp/state";

export class Engine {
  public static instance: Engine;

  static replace(canvas: HTMLCanvasElement) {
    if (Engine.instance) {
      Engine.instance.stop();
    }

    Engine.instance = new Engine(canvas);
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
      lastWorldPos: new Vector(0, 0),
    },
    keyboard: {
      isHeld: (key: KeyName) => this.heldKeys.has(key),
      subscribe: subscribeToKey,
    },
  };

  private constructor(private canvas: HTMLCanvasElement) {}

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
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    this.isRunning = true;
    requestAnimationFrame(this.nextFrame);
  }

  private stop() {
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private onMouseMove = (e: MouseEvent) => {
    this.input.pointer.lastWorldPos = new Vector(e.clientX, e.clientY);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.heldKeys.add(e.key as KeyName);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.heldKeys.delete(e.key as KeyName);
  };
}

function subscribeToKey(key: KeyName, callback: (isHeld: boolean) => void) {
  const onDown = (e: KeyboardEvent) => {
    if (e.key === key) {
      callback(true);
    }
  };
  const onUp = (e: KeyboardEvent) => {
    if (e.key === key) {
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
