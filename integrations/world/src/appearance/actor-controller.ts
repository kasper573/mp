import type { TiledResource } from "../area/tiled-resource";
import type { DestroyOptions } from "@mp/graphics";
import {
  ColorMatrixFilter,
  Container,
  createTintFilterMatrix,
  Text,
} from "@mp/graphics";
import { effect } from "@preact/signals-core";
import { TimeSpan } from "@mp/time";
import type { RiftClient } from "@rift/core";
import { Attacked, Died } from "../combat/events";
import { ActorSprite } from "./actor-sprite";
import type { ActorTextureLookup } from "./actor-texture-lookup";
import type { Actor } from "../client/views";

export interface ActorControllerOptions {
  tiled: TiledResource;
  actor: Actor;
  client: RiftClient;
  actorTextures: ActorTextureLookup;
}

export class ActorController extends Container {
  #subscriptions: Array<() => void>;
  #sprite: ActorSprite;
  #text: Text;
  #tintFilter = new ColorMatrixFilter();
  #options: ActorControllerOptions;

  constructor(options: ActorControllerOptions) {
    super();
    this.#options = options;

    const { actor, client } = options;

    this.#sprite = new ActorSprite(
      actorAnimationState(actor).isAlive
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
    this.#sprite.textureLookup = (animationName, direction) =>
      options.actorTextures(
        options.actor.appearance.modelId,
        animationName,
        direction,
      );

    this.#text = new Text({ scale: 0.25, anchor: { x: 0.5, y: 0 } });

    this.addChild(this.#sprite);
    this.addChild(this.#text);

    this.#subscriptions = [
      effect(this.#switchAnimationToMovingOrIdle),
      client.on(Attacked, (ev) => {
        if (ev.data.entityId === actor.entityId) {
          void this.#sprite
            .playToEndAndStop("attack-spear")
            .then(this.#switchAnimationToMovingOrIdle);
        }
      }),
      client.on(Died, (ev) => {
        if (ev.data === actor.entityId) {
          void this.#sprite.playToEndAndStop("death-spear");
        }
      }),
    ];

    this.onRender = this.#onRender;
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
    for (const unsubscribe of this.#subscriptions) {
      unsubscribe();
    }
  }

  #switchAnimationToMovingOrIdle = () => {
    const { isMoving, isFast, isAlive } = actorAnimationState(
      this.#options.actor,
    );
    if (isAlive) {
      if (isMoving) {
        this.#sprite.switchAnimationSmoothly(
          isFast ? "run-spear" : "walk-spear",
        );
      } else {
        this.#sprite.switchAnimationSmoothly("idle-spear");
      }
    }
  };

  #onRender = () => {
    const { actor, tiled } = this.#options;

    this.#sprite.attackSpeed = actor.combat.attackSpeed;
    this.#sprite.direction = actor.movement.dir;

    this.alpha = actor.appearance.opacity ?? 1;

    if (actor.appearance.color === undefined) {
      this.#sprite.filters = [];
    } else {
      this.#sprite.filters = [this.#tintFilter];
      this.#tintFilter.matrix = createTintFilterMatrix(actor.appearance.color);
    }

    this.#text.text =
      actor.appearance.name +
      `\n${actor.combat.health}/${actor.combat.maxHealth}`;
    if (actor.type === "character") {
      this.#text.text += `\n${actor.progression.xp}xp`;
    }

    this.position.copyFrom(tiled.tileCoordToWorld(actor.movement.coords));
    this.zIndex = this.position.y;
  };
}

function actorAnimationState(actor: Actor) {
  return {
    isMoving: !!actor.movement.path?.length,
    isFast: actor.movement.speed >= 2,
    isAlive: actor.combat.alive,
  };
}
