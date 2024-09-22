import type { Camera } from "@mp/math";
import { Vector } from "@mp/math";
import type { ReadonlySignal } from "@mp/state";
import { computed, signal } from "@mp/state";

export class Pointer {
  readonly #isDown = signal(false);
  readonly #position = signal(new Vector(0, 0));

  readonly position: ReadonlySignal<Vector> = this.#position;
  readonly isDown: ReadonlySignal<boolean> = this.#isDown;

  constructor(private viewport: HTMLElement) {}

  start() {
    this.viewport.addEventListener("pointermove", this.onPointerMove);
    this.viewport.addEventListener("pointerdown", this.onPointerDown);
    this.viewport.addEventListener("pointerup", this.onPointerUp);
  }

  stop() {
    this.viewport.removeEventListener("pointermove", this.onPointerMove);
    this.viewport.removeEventListener("pointerdown", this.onPointerDown);
    this.viewport.removeEventListener("pointerup", this.onPointerUp);
  }

  private onPointerDown = () => (this.#isDown.value = true);
  private onPointerUp = () => (this.#isDown.value = false);
  private onPointerMove = (e: PointerEvent) => {
    this.#position.value = new Vector(e.offsetX, e.offsetY);
  };
}

export class PointerForCamera extends Pointer {
  worldPosition = computed(() =>
    this.camera.screenToWorld(this.position.value),
  );

  constructor(
    viewport: HTMLElement,
    private camera: Camera,
  ) {
    super(viewport);
  }
}
