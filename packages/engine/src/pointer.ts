import { Vector } from "@mp/math";
import type { ReadonlyAtom } from "@mp/state";
import { atom, computed } from "@mp/state";
import type { Pixel } from "@mp/std";
import type { Camera } from "./camera";

export class Pointer {
  readonly #isDown = atom(false);
  readonly #position = atom(new Vector(0 as Pixel, 0 as Pixel));

  get position(): ReadonlyAtom<Vector<Pixel>> {
    return this.#position;
  }
  get isDown(): ReadonlyAtom<boolean> {
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
    const relativeX = (e.clientX - this.target.offsetLeft) as Pixel;
    const relativeY = (e.clientY - this.target.offsetTop) as Pixel;
    this.#position.set(new Vector(relativeX, relativeY));
  };
}

export class PointerForCamera extends Pointer {
  worldPosition: ReadonlyAtom<Vector<Pixel>>;

  constructor(target: HTMLElement, camera: Camera) {
    super(target);
    this.worldPosition = computed(this.position, (pos) =>
      camera.viewportToWorld(pos),
    );
  }
}
