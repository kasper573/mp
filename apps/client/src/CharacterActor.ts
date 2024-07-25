import type { Character } from "@mp/server";
import type { Engine } from "excalibur";
import { Actor, type Vector, Circle, Color } from "excalibur";

export class CharacterActor extends Actor {
  lerpTo?: Vector;
  private circle = new Circle({ radius: 10, color: Color.Red });

  constructor(character: Character) {
    super(character.coords);
  }

  override onInitialize(): void {
    this.graphics.use(this.circle);
  }

  override update(engine: Engine, delta: number) {
    super.update(engine, delta);
    if (this.lerpTo) {
      const { pos } = this;
      pos.x = lerp(pos.x, this.lerpTo.x, 0.2);
      pos.y = lerp(pos.y, this.lerpTo.y, 0.2);
      if (pos.distance(this.lerpTo) < 1) {
        pos.x = this.lerpTo.x;
        pos.y = this.lerpTo.y;
        this.lerpTo = undefined;
      }
    }
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
