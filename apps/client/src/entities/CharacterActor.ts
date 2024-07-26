import type { Character } from "@mp/server";
import type { Engine, Vector } from "@mp/excalibur";
import { Actor, Circle, Color } from "@mp/excalibur";

export class CharacterActor extends Actor {
  private lerpTo?: Vector;
  private circle = new Circle({ radius: 10, color: Color.Red });

  constructor(private character: Character) {
    super();
  }

  lerpToPosition(v: Vector) {
    if (this.pos.distance(v) > lerpMinDistance) {
      this.lerpTo = v;
    }
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
      if (pos.distance(this.lerpTo) < lerpMinDistance) {
        pos.x = this.lerpTo.x;
        pos.y = this.lerpTo.y;
        this.lerpTo = undefined;
      }
    }
    this.circle.color = this.character.connected ? Color.Green : Color.Red;
  }
}

const lerpMinDistance = 1;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
