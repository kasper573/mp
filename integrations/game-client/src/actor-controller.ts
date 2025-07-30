import type { Actor, TiledResource } from "@mp/game-shared";
import { ctxActorSpritesheetLookup } from "@mp/game-shared";
import type { DestroyOptions } from "@mp/graphics";
import {
  ColorMatrixFilter,
  Container,
  createTintFilterMatrix,
  Text,
} from "@mp/graphics";
import { effect } from "@mp/state";
import { assert } from "@mp/std";
import { TimeSpan } from "@mp/time";
import { ActorSprite } from "./actor-sprite";
import { ctxGameStateClient } from "./game-state-client";
import { ioc } from "./ioc";

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
        if (attack.actorId === actor.identity.id) {
          void this.sprite
            .playToEndAndStop("attack-spear")
            .then(this.switchAnimationToMovingOrIdle);
        }
      }),
      state.eventBus.subscribe("actor.death", (deadActorId) => {
        if (deadActorId === actor.identity.id) {
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
    this.sprite.spritesheets = assert(
      allSpritesheets.get(actor.appearance.modelId),
    );
    this.sprite.attackSpeed = actor.combat.attackSpeed;
    this.sprite.direction = actor.movement.dir;

    this.alpha = actor.appearance.opacity ?? 1;

    if (actor.appearance.color === undefined) {
      this.sprite.filters = [];
    } else {
      this.sprite.filters = [this.tintFilter];
      this.tintFilter.matrix = createTintFilterMatrix(actor.appearance.color);
    }

    this.text.text =
      actor.appearance.name +
      `\n${actor.combat.health}/${actor.combat.maxHealth}`;
    if (actor.type === "character") {
      this.text.text += `\n${actor.progression.xp}xp`;
    }

    this.position.copyFrom(tiled.tileCoordToWorld(actor.movement.coords));
    this.zIndex = this.position.y;
  };
}

function actorAnimationState(actor: Actor) {
  return {
    isMoving: !!actor.movement.path?.length,
    isFast: actor.movement.speed >= 2,
    isAlive: actor.combat.health > 0,
  };
}
