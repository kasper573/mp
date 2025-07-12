import { Matrix } from "@mp/math";
import { Vector } from "@mp/math";
import type { ReadonlySignal } from "@mp/state";
import { signal } from "@mp/state";
import type { Pixel } from "@mp/std";

export class Camera {
  private position = signal(new Vector(0 as Pixel, 0 as Pixel));
  private zoom = 1;
  readonly #transform = signal(new Matrix());
  readonly cameraSize = signal(new Vector(0 as Pixel, 0 as Pixel));

  get transform(): ReadonlySignal<Matrix> {
    return this.#transform;
  }

  constructor(initialCameraSize: Vector<Pixel>) {
    this.cameraSize.value = initialCameraSize;
  }

  update(
    worldSize: Vector<Pixel>,
    zoom: number,
    position: Vector<Pixel>,
  ): void {
    this.zoom = zoom;

    const halfCameraWidth = this.cameraSize.value.x / 2 / this.zoom;
    const halfCameraHeight = this.cameraSize.value.y / 2 / this.zoom;

    const clampedX = Math.max(
      halfCameraWidth,
      Math.min(worldSize.x - halfCameraWidth, position.x),
    );
    const clampedY = Math.max(
      halfCameraHeight,
      Math.min(worldSize.y - halfCameraHeight, position.y),
    );

    const newPos = new Vector(clampedX as Pixel, clampedY as Pixel);
    this.position.value = newPos;

    const offsetX = newPos.x - halfCameraWidth;
    const offsetY = newPos.y - halfCameraHeight;

    this.#transform.value = new Matrix([
      this.zoom,
      0,
      0,
      this.zoom,
      -offsetX * this.zoom,
      -offsetY * this.zoom,
    ]);
  }

  viewportToWorld(screenPos: Vector<Pixel>): Vector<Pixel> {
    const { x, y } = this.position.value;
    return new Vector(
      ((screenPos.x - this.cameraSize.value.x / 2) / this.zoom + x) as Pixel,
      ((screenPos.y - this.cameraSize.value.y / 2) / this.zoom + y) as Pixel,
    );
  }

  worldToViewport(worldPos: Vector<Pixel>): Vector<Pixel> {
    const { x, y } = this.position.value;
    return new Vector(
      ((worldPos.x - x) * this.zoom + this.cameraSize.value.x / 2) as Pixel,
      ((worldPos.y - y) * this.zoom + this.cameraSize.value.y / 2) as Pixel,
    );
  }
}
