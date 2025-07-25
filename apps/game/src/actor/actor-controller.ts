import { assert } from "@mp/std";
import type { DestroyOptions } from "@mp/graphics";
import {
  ColorMatrixFilter,
  Container,
  createTintFilterMatrix,
  Text,
} from "@mp/graphics";
import { TimeSpan } from "@mp/time";
import { effect } from "@mp/state";
import type { TiledResource } from "../area/tiled-resource";
import type { Actor } from "./actor";
import { ioc } from "../context/ioc";
import { ctxGameStateClient } from "../game-state/game-state-client";
import { ActorSprite } from "./actor-sprite";
import { ctxActorSpritesheetLookup } from "./actor-spritesheet-lookup";

export class ActorController extends Container {
  private subscriptions: Array<() => void>;
  private sprite: ActorSprite;
  private text: Text;
  private tintFilter = new ColorMatrixFilter();

  constructor(private options: { tiled: TiledResource; actor: Actor }) {
    super();

    const { actor } = this.options;

    this.sprite = new ActorSprite(
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

    this.text = new Text({ scale: 0.25, anchor: { x: 0.5, y: 0 } });

    this.addChild(this.sprite);
    this.addChild(this.text);

    const state = ioc.get(ctxGameStateClient);

    this.subscriptions = [
      effect(this.switchAnimationToMovingOrIdle),
      state.eventBus.subscribe("combat.attack", (attack) => {
        if (attack.actorId === actor.id) {
          void this.sprite
            .playToEndAndStop("attack-spear")
            .then(this.switchAnimationToMovingOrIdle);
        }
      }),
      state.eventBus.subscribe("actor.death", (deadActorId) => {
        if (deadActorId === actor.id) {
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
    const { isMoving, isFast, isAlive } = actorAnimationState(
      this.options.actor,
    );
    if (isAlive) {
      if (isMoving) {
        this.sprite.switchAnimationSmoothly(
          isFast ? "run-spear" : "walk-spear",
        );
      } else {
        this.sprite.switchAnimationSmoothly("idle-spear");
      }
    }
  };

  #onRender = () => {
    const { actor, tiled } = this.options;

    const allSpritesheets = ioc.get(ctxActorSpritesheetLookup);
    this.sprite.spritesheets = assert(allSpritesheets.get(actor.modelId));
    this.sprite.attackSpeed = actor.attackSpeed;
    this.sprite.direction = actor.dir;

    this.alpha = actor.opacity ?? 1;

    if (actor.color === undefined) {
      this.sprite.filters = [];
    } else {
      this.sprite.filters = [this.tintFilter];
      this.tintFilter.matrix = createTintFilterMatrix(actor.color);
    }

    this.text.text = actor.name + `\n${actor.health}/${actor.maxHealth}`;
    if (actor.type === "character") {
      this.text.text += `\n${actor.xp}xp`;
    }

    this.position.copyFrom(tiled.tileCoordToWorld(actor.coords));
    this.zIndex = this.position.y;
  };
}

function actorAnimationState(actor: Actor) {
  return {
    isMoving: !!actor.path?.length,
    isFast: actor.speed >= 2,
    isAlive: actor.health > 0,
  };
}
