import type { Character } from "@mp/server";
import { Graphics } from "@mp/pixi";
import type { VectorLike } from "@mp/math";
import { Interpolator } from "./Interpolator";

export class CharacterActor extends Graphics {
  public readonly interpolator = new Interpolator(this);

  constructor(
    private character: Character,
    private tileSize: VectorLike,
  ) {
    super();
    this.rect(0, 0, this.tileSize.x, this.tileSize.y);
    this.fill();
  }

  override _onRender = () => {
    this.fillStyle.color = this.character.connected ? 0x00ff00 : 0xff0000;
    this.interpolator.update();
  };
}
