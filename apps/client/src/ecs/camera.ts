import { clamp, Vector } from "@mp/math";
import { Rect } from "@mp/math";
import type { StrokeStyle } from "@mp/pixi";
import { Container, Graphics } from "@mp/pixi";

export class Camera {
  public target?: Vector;

  get rect(): Rect {
    const { x, y } = this.target ?? Vector.zero;
    const maxX = this.world?.width ?? 0 - this.width;
    const maxY = this.world?.height ?? 0 - this.height;

    return new Rect(
      clamp(x - this.width / 2, 0, maxX),
      clamp(y - this.height / 2, 0, maxY),
      this.width,
      this.height,
    );
  }

  constructor(
    public world?: Container,
    public width = world?.width ?? 1,
    public height = world?.height ?? 1,
  ) {}

  update(target: Vector): void {
    this.target = target;
    const { rect } = this;
    this.world?.position.set(-rect.x, -rect.y);
  }

  screenToWorld(screenPos: Vector): Vector {
    return new Vector(screenPos.x + this.rect.x, screenPos.y + this.rect.y);
  }

  worldToScreen(worldPos: Vector): Vector {
    return new Vector(worldPos.x - this.rect.x, worldPos.y - this.rect.y);
  }
}

export class CameraDebugUI extends Container {
  private g: Graphics;
  constructor(private camera: Camera) {
    super();
    this.g = new Graphics();
    this.addChild(this.g);
  }

  override _onRender = () => {
    this.g.clear();
    const { target, rect } = this.camera;
    if (target) {
      this.g.strokeStyle = strokeStyle;
      this.g.rect(rect.x, rect.y, rect.width, rect.height);
      this.g.stroke();
    }
  };
}

const strokeStyle: StrokeStyle = { width: 2, color: "rgba(150,150,150,0.9)" };
