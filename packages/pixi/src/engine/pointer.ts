import type { Camera } from "@mp/math";
import { Vector } from "@mp/math";
import type { Atom } from "@mp/state";
import { createAtom, createMemo } from "@mp/state";

export class Pointer {
  readonly #isDown = createAtom(false);
  readonly #position = createAtom(new Vector(0, 0));

  get position(): Vector {
    return this.#position.get();
  }
  get isDown(): boolean {
    return this.#isDown.get();
  }

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

  private onPointerDown = () => this.#isDown.set(true);
  private onPointerUp = () => this.#isDown.set(false);
  private onPointerMove = (e: PointerEvent) => {
    this.#position.set(new Vector(e.offsetX, e.offsetY));
  };
}

export class PointerForCamera extends Pointer {
  #worldPosition = createMemo(() => this.camera.screenToWorld(this.position));

  get worldPosition(): Vector {
    return this.#worldPosition();
  }

  constructor(
    viewport: HTMLElement,
    private camera: Camera,
  ) {
    super(viewport);
  }
}
