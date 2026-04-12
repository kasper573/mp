import type { Entity, RiftClient } from "@rift/core";
import type { TiledResource } from "@mp/world";
import {
  Position,
  Movement,
  Combat,
  Appearance,
  CharacterIdentity,
  Progression,
  NpcIdentity,
  AttackAnimation,
  DeathAnimation,
} from "@mp/world";
import type { ActorModelId } from "@mp/fixtures";
import type { DestroyOptions } from "@mp/graphics";
import { cardinalDirections } from "@mp/math";
import type { TimesPerSecond } from "@mp/std";
import {
  ColorMatrixFilter,
  Container,
  createTintFilterMatrix,
  Text,
} from "@mp/graphics";
import { effect } from "@mp/state";
import { TimeSpan } from "@mp/time";
import { ActorSprite } from "./actor-sprite";
import type { ActorTextureLookup } from "./actor-texture-lookup";

export interface ActorControllerOptions {
  tiled: TiledResource;
  entity: Entity;
  rift: RiftClient;
  actorTextures: ActorTextureLookup;
}

export class ActorController extends Container {
  private subscriptions: Array<() => void>;
  private sprite: ActorSprite;
  private text: Text;
  private tintFilter = new ColorMatrixFilter();

  constructor(private options: ActorControllerOptions) {
    super();

    const { entity } = this.options;

    const combat = entity.get(Combat);

    this.sprite = new ActorSprite(
      combat.alive
        ? {
            name: "idle-spear",
            type: "smooth-switch",
            currentTime: TimeSpan.Zero,
          }
        : {
            name: "death-spear",
            type: "fixed-at-end",
          },
    );
    this.sprite.textureLookup = (animationName, direction) =>
      options.actorTextures(
        options.entity.get(Appearance).modelId as ActorModelId,
        animationName,
        direction,
      );

    this.text = new Text({ scale: 0.25, anchor: { x: 0.5, y: 0 } });

    this.addChild(this.sprite);
    this.addChild(this.text);

    this.subscriptions = [
      effect(this.switchAnimationToMovingOrIdle),
      options.rift.on(AttackAnimation, (data) => {
        if (data.attackerId === entity.id) {
          void this.sprite
            .playToEndAndStop("attack-spear")
            .then(this.switchAnimationToMovingOrIdle);
        }
      }),
      options.rift.on(DeathAnimation, (data) => {
        if (data.entityId === entity.id) {
          void this.sprite.playToEndAndStop("death-spear");
        }
      }),
    ];

    this.onRender = this.#onRender;
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
  }

  private switchAnimationToMovingOrIdle = () => {
    const { entity } = this.options;
    const combat = entity.get(Combat);
    const movement = entity.get(Movement);
    if (combat.alive) {
      if (movement.moving) {
        this.sprite.switchAnimationSmoothly(
          movement.speed >= 2 ? "run-spear" : "walk-spear",
        );
      } else {
        this.sprite.switchAnimationSmoothly("idle-spear");
      }
    }
  };

  #onRender = () => {
    const { entity, tiled } = this.options;

    const combat = entity.get(Combat);
    const movement = entity.get(Movement);
    const appearance = entity.get(Appearance);
    const coords = entity.get(Position);

    this.sprite.attackSpeed = combat.attackSpeed as TimesPerSecond;
    this.sprite.direction = cardinalDirections[movement.dir];
    this.alpha = 1;

    const isNpc = entity.has(NpcIdentity);
    if (isNpc) {
      this.sprite.filters = [this.tintFilter];
      this.tintFilter.matrix = createTintFilterMatrix(0xff0000);
    } else {
      this.sprite.filters = [];
    }

    this.text.text = appearance.name + `\n${combat.health}/${combat.maxHealth}`;
    if (entity.has(CharacterIdentity)) {
      const progression = entity.get(Progression);
      this.text.text += `\n${progression.xp}xp`;
    }

    this.position.copyFrom(tiled.tileCoordToWorld(coords));
    this.zIndex = this.position.y;
  };
}
