import { Matrix, vec } from "@mp/math";
import type { Size, Vector } from "@mp/math";
import { atom } from "@mp/state";

export class Camera {
  private position = vec(0, 0);
  private zoom = 1;
  readonly #transform = atom(new Matrix());
  readonly #cameraSize = atom<Size>({ width: 0, height: 0 });

  get transform(): Matrix {
    return this.#transform.get();
  }

  get cameraSize(): Size {
    return this.#cameraSize.get();
  }

  set cameraSize(size: Size) {
    this.#cameraSize.set(size);
  }

  constructor(initialCameraSize: Size) {
    this.#cameraSize.set(initialCameraSize);
  }

  update(worldSize: Size, zoom: number, position: Vector): void {
    this.zoom = zoom;

    const halfCameraWidth = this.cameraSize.width / 2 / this.zoom;
    const halfCameraHeight = this.cameraSize.height / 2 / this.zoom;

    const clampedX = Math.max(
      halfCameraWidth,
      Math.min(worldSize.width - halfCameraWidth, position.x),
    );
    const clampedY = Math.max(
      halfCameraHeight,
      Math.min(worldSize.height - halfCameraHeight, position.y),
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
      (screenPos.x - this.cameraSize.width / 2) / this.zoom + this.position.x,
      (screenPos.y - this.cameraSize.height / 2) / this.zoom + this.position.y,
    );
  }

  worldToViewport(worldPos: Vector): Vector {
    return vec(
      (worldPos.x - this.position.x) * this.zoom + this.cameraSize.width / 2,
      (worldPos.y - this.position.y) * this.zoom + this.cameraSize.height / 2,
    );
  }
}
