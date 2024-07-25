import type { Character } from "@mp/server";
import type { Engine, Vector } from "excalibur";
import { Actor, Circle, Color } from "excalibur";
import { coordsToVec } from "../data";

export class CharacterActor extends Actor {
  lerpTo?: Vector;
  private circle = new Circle({ radius: 10, color: Color.Red });
  private cleanup: () => void;

  constructor(private character: Character) {
    super(character.coords);
    this.cleanup = character.coords.onChange(this.lerpToCurrentCoords);
  }

  private lerpToCurrentCoords = () => {
    const v = coordsToVec(this.character.coords);
    if (this.pos.distance(v) > lerpMinDistance) {
      this.lerpTo = v;
    }
  };

  override onPostKill(): void {
    this.cleanup();
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
