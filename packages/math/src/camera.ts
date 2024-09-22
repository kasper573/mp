import { Matrix } from "./matrix";
import type { Size } from "./size";
import { Vector } from "./vector";

export class Camera {
  private position = new Vector(0, 0);
  private zoom = 1;
  readonly transform: Matrix = new Matrix();

  constructor(
    private readonly cameraSize: Size,
    private desiredZoom = 2,
    private maxZoom = 3,
  ) {}

  update(worldSize: Size, position: Vector = this.position) {
    const scaleX = this.cameraSize.width / worldSize.width;
    const scaleY = this.cameraSize.height / worldSize.height;

    const minZoom = Math.max(scaleX, scaleY);

    this.zoom = Math.max(minZoom, Math.min(this.maxZoom, this.desiredZoom));

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

    this.position = new Vector(clampedX, clampedY);

    const offsetX = this.position.x - halfCameraWidth;
    const offsetY = this.position.y - halfCameraHeight;

    this.transform.set(
      this.zoom,
      0,
      0,
      this.zoom,
      -offsetX * this.zoom,
      -offsetY * this.zoom,
    );

    return this.transform;
  }

  viewportToWorld(screenPos: Vector): Vector {
    return new Vector(
      (screenPos.x - this.cameraSize.width / 2) / this.zoom + this.position.x,
      (screenPos.y - this.cameraSize.height / 2) / this.zoom + this.position.y,
    );
  }

  worldToViewport(worldPos: Vector): Vector {
    return new Vector(
      (worldPos.x - this.position.x) * this.zoom + this.cameraSize.width / 2,
      (worldPos.y - this.position.y) * this.zoom + this.cameraSize.height / 2,
    );
  }
}
