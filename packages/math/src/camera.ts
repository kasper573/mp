import { clamp } from "./clamp";
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
    private worldSize: Size = { width: 0, height: 0 },
  ) {}

  resize(size: Size) {
    this.worldSize = size;
    this.update(this.position);
  }

  update(position: Vector = this.position): Matrix {
    const scaleX = this.cameraSize.width / this.worldSize.width;
    const scaleY = this.cameraSize.height / this.worldSize.height;
    const minZoom = Math.max(scaleX, scaleY);

    this.zoom = clamp(this.desiredZoom, minZoom, this.maxZoom);

    const halfCameraWidth = this.cameraSize.width / 2 / this.zoom;
    const halfCameraHeight = this.cameraSize.height / 2 / this.zoom;

    this.position = new Vector(
      clamp(
        position.x,
        halfCameraWidth,
        this.worldSize.width - halfCameraWidth,
      ),
      clamp(
        position.y,
        halfCameraHeight,
        this.worldSize.height - halfCameraHeight,
      ),
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

    return this.transform;
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
