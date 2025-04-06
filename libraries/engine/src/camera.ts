import { Matrix } from "@mp/math";
import { Vector } from "@mp/math";
import { atom } from "@mp/state";
import type { Pixel } from "@mp/std";

export class Camera {
  private position = new Vector(0 as Pixel, 0 as Pixel);
  private zoom = 1;
  readonly #transform = atom(new Matrix());
  readonly #cameraSize = atom(new Vector(0 as Pixel, 0 as Pixel));

  get transform(): Matrix {
    return this.#transform.get();
  }

  get cameraSize(): Vector<Pixel> {
    return this.#cameraSize.get();
  }

  set cameraSize(size: Vector<Pixel>) {
    this.#cameraSize.set(size);
  }

  constructor(initialCameraSize: Vector<Pixel>) {
    this.#cameraSize.set(initialCameraSize);
  }

  update(
    worldSize: Vector<Pixel>,
    zoom: number,
    position: Vector<Pixel>,
  ): void {
    this.zoom = zoom;

    const halfCameraWidth = this.cameraSize.x / 2 / this.zoom;
    const halfCameraHeight = this.cameraSize.y / 2 / this.zoom;

    const clampedX = Math.max(
      halfCameraWidth,
      Math.min(worldSize.x - halfCameraWidth, position.x),
    );
    const clampedY = Math.max(
      halfCameraHeight,
      Math.min(worldSize.y - halfCameraHeight, position.y),
    );

    this.position = new Vector(clampedX as Pixel, clampedY as Pixel);

    const offsetX = this.position.x - halfCameraWidth;
    const offsetY = this.position.y - halfCameraHeight;

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
    return new Vector(
      ((screenPos.x - this.cameraSize.x / 2) / this.zoom +
        this.position.x) as Pixel,
      ((screenPos.y - this.cameraSize.y / 2) / this.zoom +
        this.position.y) as Pixel,
    );
  }

  worldToViewport(worldPos: Vector<Pixel>): Vector<Pixel> {
    return new Vector(
      ((worldPos.x - this.position.x) * this.zoom +
        this.cameraSize.x / 2) as Pixel,
      ((worldPos.y - this.position.y) * this.zoom +
        this.cameraSize.y / 2) as Pixel,
    );
  }
}
