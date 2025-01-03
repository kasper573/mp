import type { Vector } from "@mp/math";
import { vec } from "@mp/math";
import type { Computed } from "@mp/state";
import { atom, computed } from "@mp/state";
import type { Camera } from "./camera";

export class Pointer {
  readonly #position = atom(vec(0, 0));
  #isRunning = false;

  get position(): Vector {
    return this.#position.get();
  }

  constructor(private target: HTMLElement) {}

  on(eventType: "click", callback: (e: MouseEvent) => unknown) {
    const listener = (e: MouseEvent) => {
      if (this.#isRunning) {
        callback(e);
      }
    };
    this.target.addEventListener(eventType, listener);
    return () => this.target.removeEventListener(eventType, listener);
  }

  start() {
    this.#isRunning = true;
    this.target.addEventListener("pointermove", this.onPointerMove);
  }

  stop() {
    this.#isRunning = false;
    this.target.removeEventListener("pointermove", this.onPointerMove);
  }

  private onPointerMove = (e: PointerEvent) => {
    const relativeX = e.clientX - this.target.offsetLeft;
    const relativeY = e.clientY - this.target.offsetTop;
    this.#position.set(vec(relativeX, relativeY));
  };
}

export class PointerForCamera extends Pointer {
  #worldPosition: Computed<Vector>;

  get worldPosition(): Vector {
    return this.#worldPosition();
  }

  constructor(target: HTMLElement, camera: Camera) {
    super(target);
    this.#worldPosition = computed(() => camera.viewportToWorld(this.position));
  }
}
