import type { Character } from "@mp/server";
import type { Engine } from "@mp/excalibur";
import { Actor, Circle, Color } from "@mp/excalibur";
import { Movement } from "./Movement";

export class CharacterActor extends Actor {
  private circle = new Circle({ radius: 10, color: Color.Red });

  constructor(private character: Character) {
    super();
    this.addComponent(new Movement(() => this.pos));
  }

  override onInitialize(): void {
    this.graphics.use(this.circle);
  }

  override update(engine: Engine, delta: number) {
    super.update(engine, delta);
    this.circle.color = this.character.connected ? Color.Green : Color.Red;
  }
}
