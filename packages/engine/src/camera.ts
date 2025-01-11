import { Matrix, vec } from "@mp/math";
import type { Vector } from "@mp/math";
import { atom } from "@mp/state";

export class Camera {
  private position = vec(0, 0);
  private zoom = 1;
  readonly #transform = atom(new Matrix());
  readonly #cameraSize = atom<Vector>({ x: 0, y: 0 });

  get transform(): Matrix {
    return this.#transform.get();
  }

  get cameraSize(): Vector {
    return this.#cameraSize.get();
  }

  set cameraSize(size: Vector) {
    this.#cameraSize.set(size);
  }

  constructor(initialCameraSize: Vector) {
    this.#cameraSize.set(initialCameraSize);
  }

  update(worldSize: Vector, zoom: number, position: Vector): void {
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

    this.position = vec(clampedX, clampedY);

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

  viewportToWorld(screenPos: Vector): Vector {
    return vec(
      (screenPos.x - this.cameraSize.x / 2) / this.zoom + this.position.x,
      (screenPos.y - this.cameraSize.y / 2) / this.zoom + this.position.y,
    );
  }

  worldToViewport(worldPos: Vector): Vector {
    return vec(
      (worldPos.x - this.position.x) * this.zoom + this.cameraSize.x / 2,
      (worldPos.y - this.position.y) * this.zoom + this.cameraSize.y / 2,
    );
  }
}
