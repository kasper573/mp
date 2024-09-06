import { Vector } from "@mp/math";
import type { Size } from "@mp/pixi";
import { Matrix } from "@mp/pixi";

export class Camera {
  private position = new Vector(0, 0);
  private zoom = 1;
  readonly transform: Matrix = new Matrix();

  constructor(private readonly cameraSize: Size) {}

  update(worldSize: Size, position: Vector): void {
    const scaleX = this.cameraSize.width / worldSize.width;
    const scaleY = this.cameraSize.height / worldSize.height;
    this.zoom = Math.max(scaleX, scaleY);

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
