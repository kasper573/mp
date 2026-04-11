import type { Entity } from "@rift/core";
import type { DestroyOptions } from "@mp/graphics";
import {
  ColorMatrixFilter,
  Container,
  createTintFilterMatrix,
  Graphics,
  Text,
} from "@mp/graphics";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import { Appearance, CharacterMeta, Health, Position } from "../../components";
import type { TiledResource } from "../area/tiled-resource";

export interface ActorControllerOptions {
  entity: Entity;
  tiled: TiledResource;
}

export class ActorController extends Container {
  private body: Graphics;
  private text: Text;
  private tintFilter = new ColorMatrixFilter();
  private lastColor: number | undefined;

  constructor(private options: ActorControllerOptions) {
    super();

    this.body = new Graphics();
    this.body.rect(-12, -32, 24, 32);
    this.body.fill({ color: 0xffffff });

    this.text = new Text({ scale: 0.25, anchor: { x: 0.5, y: 0 } });

    this.addChild(this.body);
    this.addChild(this.text);

    this.onRender = this.#onRender;
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
  }

  #onRender = () => {
    const { entity, tiled } = this.options;
    if (!entity.has(Position) || !entity.has(Appearance)) {
      this.visible = false;
      return;
    }
    this.visible = true;

    const appearance = entity.get(Appearance);
    this.alpha = appearance.opacity ?? 1;

    if (this.lastColor !== appearance.color) {
      this.lastColor = appearance.color;
      this.body.filters = [this.tintFilter];
      this.tintFilter.matrix = createTintFilterMatrix(appearance.color);
    }

    let label = appearance.name;
    if (entity.has(Health)) {
      const health = entity.get(Health);
      label += `\n${health.current}/${health.max}`;
    }
    if (entity.has(CharacterMeta)) {
      const meta = entity.get(CharacterMeta);
      label += `\n${meta.xp}xp`;
    }
    this.text.text = label;

    const pos = entity.get(Position) as Vector<Tile>;
    const world = tiled.tileCoordToWorld(pos);
    this.position.set(world.x, world.y);
    this.zIndex = world.y;
  };
}
