import type { Vector } from "@mp/math";
import { vec } from "@mp/math";
import type { Computed } from "@mp/state";
import { atom, computed } from "@mp/state";
import type { Camera } from "./camera.ts";

export class Pointer {
  readonly #isDown = atom(false);
  readonly #position = atom(vec(0, 0));

  get position(): Vector {
    return this.#position.get();
  }
  get isDown(): boolean {
    return this.#isDown.get();
  }

  constructor(private target: HTMLElement) {}

  start() {
    this.target.addEventListener("pointermove", this.onPointerMove);
    this.target.addEventListener("pointerdown", this.onPointerDown);
    this.target.addEventListener("pointerup", this.onPointerUp);
  }

  stop() {
    this.target.removeEventListener("pointermove", this.onPointerMove);
    this.target.removeEventListener("pointerdown", this.onPointerDown);
    this.target.removeEventListener("pointerup", this.onPointerUp);
  }

  private onPointerDown = () => this.#isDown.set(true);
  private onPointerUp = () => this.#isDown.set(false);
  private onPointerMove = (e: PointerEvent) => {
    this.#position.set(vec(e.offsetX, e.offsetY));
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
