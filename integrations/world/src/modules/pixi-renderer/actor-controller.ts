import type { Entity } from "@rift/core";
import { VectorSpring } from "@mp/engine";
import type { DestroyOptions } from "@mp/graphics";
import { Container, Graphics, Text, Ticker } from "@mp/graphics";
import { Vector } from "@mp/math";
import { computed } from "@mp/state";
import type { Pixel, Tile } from "@mp/std";
import { TimeSpan } from "@mp/time";
import { Appearance, CharacterMeta, Health, Position } from "../../components";
import type { TiledResource } from "../area/tiled-resource";

export interface ActorControllerOptions {
  entity: Entity;
  tiled: TiledResource;
}

export class ActorController extends Container {
  private body: Graphics;
  private text: Text;
  private lastColor: number | undefined;
  private positionSpring: VectorSpring<Pixel>;

  constructor(private options: ActorControllerOptions) {
    super();

    this.body = new Graphics();

    this.text = new Text({ scale: 0.25, anchor: { x: 0.5, y: 0 } });

    this.addChild(this.body);
    this.addChild(this.text);

    const targetWorld = computed(() => {
      const { entity, tiled } = this.options;
      if (!entity.has(Position)) return Vector.zero<Pixel>();
      const pos = entity.get(Position) as Vector<Tile>;
      return tiled.tileCoordToWorld(pos);
    });
    this.positionSpring = new VectorSpring(
      targetWorld,
      () => ({ stiffness: 120, damping: 26, mass: 1, precision: 0.1 }),
      targetWorld.value,
    );

    this.onRender = this.#onRender;
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
  }

  #onRender = () => {
    const { entity } = this.options;
    if (!entity.has(Position) || !entity.has(Appearance)) {
      this.visible = false;
      return;
    }
    this.visible = true;

    const appearance = entity.get(Appearance);
    this.alpha = appearance.opacity ?? 1;

    if (this.lastColor !== appearance.color) {
      this.lastColor = appearance.color;
      this.body.clear();
      this.body.rect(-12, -32, 24, 32);
      this.body.fill({ color: appearance.color });
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

    this.positionSpring.update(
      TimeSpan.fromMilliseconds(Ticker.shared.deltaMS),
    );
    const world = this.positionSpring.value.value;
    this.position.set(world.x, world.y);
    this.zIndex = world.y;
  };
}
