import type { Camera } from "@mp/math";
import { Vector } from "@mp/math";
import type { Computed } from "@mp/state";
import { atom, computed } from "@mp/state";

export class Pointer {
  protected _isDown = atom(false);
  protected _position = atom(new Vector(0, 0));

  get position(): Vector {
    return this._position.get();
  }
  get isDown(): boolean {
    return this._isDown.get();
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

  private onPointerDown = () => this._isDown.set(true);
  private onPointerUp = () => this._isDown.set(false);
  private onPointerMove = (e: PointerEvent) => {
    this._position.set(new Vector(e.offsetX, e.offsetY));
  };
}

export class PointerForCamera extends Pointer {
  #worldPosition: Computed<Vector>;

  get worldPosition(): Vector {
    return this.#worldPosition();
  }

  constructor(viewport: HTMLElement, camera: Camera) {
    super(viewport);
    this.#worldPosition = computed(() =>
      camera.screenToWorld(this._position.get()),
    );
  }
}
