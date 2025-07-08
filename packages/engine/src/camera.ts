import { Matrix } from "@mp/math";
import { Vector } from "@mp/math";
import type { ReadonlyObservable } from "@mp/state";
import { mutableObservable } from "@mp/state";
import type { Pixel } from "@mp/std";

export class Camera {
  private position = mutableObservable(new Vector(0 as Pixel, 0 as Pixel));
  private zoom = 1;
  readonly #transform = mutableObservable(new Matrix());
  readonly cameraSize = mutableObservable(new Vector(0 as Pixel, 0 as Pixel));

  get transform(): ReadonlyObservable<Matrix> {
    return this.#transform;
  }

  constructor(initialCameraSize: Vector<Pixel>) {
    this.cameraSize.set(initialCameraSize);
  }

  update(
    worldSize: Vector<Pixel>,
    zoom: number,
    position: Vector<Pixel>,
  ): void {
    this.zoom = zoom;

    const halfCameraWidth =
      this.cameraSize.$getObservableValue().x / 2 / this.zoom;
    const halfCameraHeight =
      this.cameraSize.$getObservableValue().y / 2 / this.zoom;

    const clampedX = Math.max(
      halfCameraWidth,
      Math.min(worldSize.x - halfCameraWidth, position.x),
    );
    const clampedY = Math.max(
      halfCameraHeight,
      Math.min(worldSize.y - halfCameraHeight, position.y),
    );

    const newPos = new Vector(clampedX as Pixel, clampedY as Pixel);
    this.position.set(newPos);

    const offsetX = newPos.x - halfCameraWidth;
    const offsetY = newPos.y - halfCameraHeight;

    this.#transform.set(
      new Matrix([
        this.zoom,
        0,
        0,
        this.zoom,
        -offsetX * this.zoom,
        -offsetY * this.zoom,
      ]),
    );
  }

  viewportToWorld(screenPos: Vector<Pixel>): Vector<Pixel> {
    const { x, y } = this.position.$getObservableValue();
    return new Vector(
      ((screenPos.x - this.cameraSize.$getObservableValue().x / 2) / this.zoom +
        x) as Pixel,
      ((screenPos.y - this.cameraSize.$getObservableValue().y / 2) / this.zoom +
        y) as Pixel,
    );
  }

  worldToViewport(worldPos: Vector<Pixel>): Vector<Pixel> {
    const { x, y } = this.position.$getObservableValue();
    return new Vector(
      ((worldPos.x - x) * this.zoom +
        this.cameraSize.$getObservableValue().x / 2) as Pixel,
      ((worldPos.y - y) * this.zoom +
        this.cameraSize.$getObservableValue().y / 2) as Pixel,
    );
  }
}
