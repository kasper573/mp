import { Vector } from "@mp/math";
import type { Size } from "@mp/pixi";
import { Matrix } from "@mp/pixi";

export class Camera {
  private position = new Vector(0, 0);
  private zoom = 1;

  constructor(private readonly cameraSize: Size) {}

  update(worldSize: Size, position: Vector): Matrix {
    this.position = position;

    const m = new Matrix();

    const scaleX = this.cameraSize.width / worldSize.width;
    const scaleY = this.cameraSize.height / worldSize.height;
    this.zoom = Math.max(scaleX, scaleY);

    const offsetX = position.x - this.cameraSize.width / 2 / this.zoom;
    const offsetY = position.y - this.cameraSize.height / 2 / this.zoom;

    m.set(
      this.zoom,
      0,
      0,
      this.zoom,
      -offsetX * this.zoom,
      -offsetY * this.zoom,
    );

    return m;
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
