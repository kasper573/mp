import { Vector } from "@mp/math";
import type { ReadonlySignal } from "@mp/state";
import { computed, signal } from "@mp/state";
import type { Pixel } from "@mp/std";
import type { Camera } from "./camera";

export class Pointer {
  readonly #isDown = signal(false);
  readonly #position = signal(new Vector(0 as Pixel, 0 as Pixel));

  get position(): ReadonlySignal<Vector<Pixel>> {
    return this.#position;
  }
  get isDown(): ReadonlySignal<boolean> {
    return this.#isDown;
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

  private onPointerDown = () => (this.#isDown.value = true);
  private onPointerUp = () => (this.#isDown.value = false);
  private onPointerMove = (e: PointerEvent) => {
    const targetBounds = this.target.getBoundingClientRect();
    const relativeX = (e.clientX - targetBounds.left) as Pixel;
    const relativeY = (e.clientY - targetBounds.top) as Pixel;
    this.#position.value = new Vector(relativeX, relativeY);
  };
}

export class PointerForCamera extends Pointer {
  worldPosition: ReadonlySignal<Vector<Pixel>>;

  constructor(target: HTMLElement, camera: Camera) {
    super(target);
    this.worldPosition = computed(() =>
      camera.viewportToWorld(this.position.value),
    );
  }
}
