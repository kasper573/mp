import { Graphics } from "@mp/pixi";
import type { VectorLike } from "@mp/math";
import { Interpolator } from "./Interpolator";

export class CharacterActor extends Graphics {
  readonly interpolator = new Interpolator(this);

  constructor(private tileSize: VectorLike) {
    super();

    this.fillStyle.color = 0x00ff00;
    this.rect(
      -this.tileSize.x / 2,
      -this.tileSize.y / 2,
      this.tileSize.x,
      this.tileSize.y,
    );
    this.fill();
  }

  override _onRender = () => this.interpolator.update();
}
