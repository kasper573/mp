import type { Engine } from "@mp/pixi";
import { Graphics } from "@mp/pixi";
import type { VectorLike } from "@mp/math";
import { Interpolator } from "./Interpolator";

export class CharacterActor extends Graphics {
  readonly interpolator: Interpolator;

  constructor({ tileSize, engine }: { tileSize: VectorLike; engine: Engine }) {
    super();
    this.interpolator = new Interpolator(this, engine);
    this.fillStyle.color = 0x00ff00;
    this.rect(-tileSize.x / 2, -tileSize.y / 2, tileSize.x, tileSize.y);
    this.fill();
  }

  override _onRender = () => this.interpolator.update();
}
