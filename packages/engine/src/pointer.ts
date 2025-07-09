import { Vector } from "@mp/math";
import type { ReadonlyObservable } from "@mp/state";
import { observable } from "@mp/state";
import type { Pixel } from "@mp/std";
import type { Camera } from "./camera";

export class Pointer {
  readonly #isDown = observable(false);
  readonly #position = observable(new Vector(0 as Pixel, 0 as Pixel));

  get position(): ReadonlyObservable<Vector<Pixel>> {
    return this.#position;
  }
  get isDown(): ReadonlyObservable<boolean> {
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

  private onPointerDown = () => this.#isDown.set(true);
  private onPointerUp = () => this.#isDown.set(false);
  private onPointerMove = (e: PointerEvent) => {
    const targetBounds = this.target.getBoundingClientRect();
    const relativeX = (e.clientX - targetBounds.left) as Pixel;
    const relativeY = (e.clientY - targetBounds.top) as Pixel;
    this.#position.set(new Vector(relativeX, relativeY));
  };
}

export class PointerForCamera extends Pointer {
  worldPosition: ReadonlyObservable<Vector<Pixel>>;

  constructor(target: HTMLElement, camera: Camera) {
    super(target);
    this.worldPosition = this.position.derive((pos) =>
      camera.viewportToWorld(pos),
    );
  }
}
