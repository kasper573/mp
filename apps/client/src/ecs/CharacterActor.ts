import type { Character } from "@mp/server";
import type { Engine } from "@mp/pixi";
import { Actor, Color, Rectangle } from "@mp/pixi";
import { Interpolator } from "./Interpolator";

export class CharacterActor extends Actor {
  private rect = new Rectangle({ width: 16, height: 16 });

  constructor(private character: Character) {
    super();
    this.addComponent(new Interpolator(() => this.pos));
  }

  override onInitialize(): void {
    this.graphics.use(this.rect);
  }

  override update(engine: Engine, delta: number) {
    super.update(engine, delta);
    this.rect.color = this.character.connected ? Color.Green : Color.Red;
  }
}
