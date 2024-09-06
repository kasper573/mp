import { clamp, Vector } from "@mp/math";
import type { Size } from "@mp/pixi";
import { Matrix } from "@mp/pixi";

export class Camera {
  private position = new Vector(0, 0);
  private zoom = 1;
  readonly transform: Matrix = new Matrix();

  constructor(
    private readonly cameraSize: Size,
    private desiredZoom = 2,
    private maxZoom = 3,
  ) {}

  update(worldSize: Size, position: Vector): void {
    const scaleX = this.cameraSize.width / worldSize.width;
    const scaleY = this.cameraSize.height / worldSize.height;
    const minZoom = Math.max(scaleX, scaleY);

    this.zoom = clamp(this.desiredZoom, minZoom, this.maxZoom);

    const halfCameraWidth = this.cameraSize.width / 2 / this.zoom;
    const halfCameraHeight = this.cameraSize.height / 2 / this.zoom;

    this.position = new Vector(
      clamp(position.x, halfCameraWidth, worldSize.width - halfCameraWidth),
      clamp(position.y, halfCameraHeight, worldSize.height - halfCameraHeight),
    );

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
  }

  screenToWorld(screenPos: Vector): Vector {
    return new Vector(
      (screenPos.x - this.cameraSize.width / 2) / this.zoom + this.position.x,
      (screenPos.y - this.cameraSize.height / 2) / this.zoom + this.position.y,
    );
  }

  worldToScreen(worldPos: Vector): Vector {
    return new Vector(
      (worldPos.x - this.position.x) * this.zoom + this.cameraSize.width / 2,
      (worldPos.y - this.position.y) * this.zoom + this.cameraSize.height / 2,
    );
  }
}
