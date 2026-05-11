import type { TiledResource } from "../area/tiled-resource";
import type { DestroyOptions } from "@mp/graphics";
import {
  ColorMatrixFilter,
  Container,
  createTintFilterMatrix,
  Text,
  Ticker,
} from "@mp/graphics";
import { effect } from "@preact/signals-core";
import { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import { TimeSpan } from "@mp/time";
import type { EntityId } from "@rift/core";
import type { MpRiftClient } from "../client";
import { Attacked } from "../combat/events";
import { Combat } from "../combat/components";
import { Movement } from "../movement/components";
import { Appearance } from "../appearance/components";
import { CharacterTag } from "../identity/components";
import { Progression } from "../progression/components";
import { ActorSprite } from "./actor-sprite";
import type { ActorTextureLookup } from "./actor-texture-lookup";
import { interpolationEnabled } from "../renderer/settings";

const TELEPORT_THRESHOLD: Tile = 3 as Tile;

export interface ActorControllerOptions {
  tiled: TiledResource;
  entityId: EntityId;
  client: MpRiftClient;
  actorTextures: ActorTextureLookup;
}

export class ActorController extends Container {
  #subscriptions: Array<() => void>;
  #sprite: ActorSprite;
  #text: Text;
  #tintFilter = new ColorMatrixFilter();
  #options: ActorControllerOptions;
  #wasAlive: boolean;
  #displayCoords?: Vector<Tile>;

  constructor(options: ActorControllerOptions) {
    super();
    this.#options = options;

    const { entityId, client } = options;
    const initialAlive = client.world.get(entityId, Combat)?.alive ?? false;
    this.#wasAlive = initialAlive;

    this.#sprite = new ActorSprite(
      initialAlive
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
    this.#sprite.textureLookup = (animationName, direction) => {
      const appearance = client.world.get(entityId, Appearance);
      if (!appearance) {
        return [];
      }
      return options.actorTextures(
        appearance.modelId,
        animationName,
        direction,
      );
    };

    this.#text = new Text({ scale: 0.25, anchor: { x: 0.5, y: 0 } });

    this.addChild(this.#sprite);
    this.addChild(this.#text);

    this.#subscriptions = [
      effect(this.#updateBaseAnimation),
      client.on(Attacked, (ev) => {
        if (ev.data.entityId !== entityId) {
          return;
        }
        void this.#sprite
          .playToEndAndStop("attack-spear")
          .then(this.#resumeBaseAnimation);
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

  #updateBaseAnimation = () => {
    const { isMoving, isFast, isAlive } = this.#animationState();
    if (this.#wasAlive && !isAlive) {
      void this.#sprite.playToEndAndStop("death-spear");
    } else if (isAlive) {
      this.#sprite.switchAnimationSmoothly(
        isMoving ? (isFast ? "run-spear" : "walk-spear") : "idle-spear",
      );
    }
    this.#wasAlive = isAlive;
  };

  #resumeBaseAnimation = () => {
    const { isMoving, isFast, isAlive } = this.#animationState();
    if (!isAlive) {
      void this.#sprite.playToEndAndStop("death-spear");
      return;
    }
    this.#sprite.switchAnimationSmoothly(
      isMoving ? (isFast ? "run-spear" : "walk-spear") : "idle-spear",
    );
  };

  #animationState() {
    const { entityId, client } = this.#options;
    const [mv, combat] = client.world.signal.get(
      entityId,
      Movement,
      Combat,
    ).value;
    return {
      isMoving: !!mv?.moveTarget,
      isFast: (mv?.speed ?? 0) >= 2,
      isAlive: combat?.alive ?? false,
    };
  }

  #onRender = () => {
    const { entityId, client, tiled } = this.#options;
    const [mv, combat, appearance, charTag, progression] = client.world.get(
      entityId,
      Movement,
      Combat,
      Appearance,
      CharacterTag,
      Progression,
    );

    if (combat) {
      this.#sprite.attackSpeed = combat.attackSpeed;
    }
    if (mv) {
      this.#sprite.direction = mv.direction;
    }

    this.alpha = appearance?.opacity ?? 1;

    if (appearance?.color === undefined) {
      this.#sprite.filters = [];
    } else {
      this.#sprite.filters = [this.#tintFilter];
      this.#tintFilter.matrix = createTintFilterMatrix(appearance.color);
    }

    const name = appearance?.name ?? "";
    const health = combat?.health ?? 0;
    const maxHealth = combat?.maxHealth ?? 0;
    let text = `${name}\n${health}/${maxHealth}`;
    if (charTag && progression) {
      text += `\n${progression.xp}xp`;
    }
    this.#text.text = text;

    if (mv) {
      this.position.copyFrom(tiled.tileCoordToWorld(this.#stepDisplay(mv)));
      this.zIndex = this.position.y;
    }
  };

  #stepDisplay(mv: { coords: Vector<Tile>; speed: Tile }): Vector<Tile> {
    const { coords, speed } = mv;
    if (!this.#displayCoords || !interpolationEnabled.value) {
      this.#displayCoords = coords;
      return coords;
    }
    const remaining = this.#displayCoords.distance(coords);
    if (remaining > TELEPORT_THRESHOLD) {
      this.#displayCoords = coords;
      return coords;
    }
    const step = speed * (Ticker.shared.deltaMS / 1000);
    if (step >= remaining || remaining < 0.001) {
      this.#displayCoords = coords;
      return coords;
    }
    const k = step / remaining;
    this.#displayCoords = new Vector(
      (this.#displayCoords.x + (coords.x - this.#displayCoords.x) * k) as Tile,
      (this.#displayCoords.y + (coords.y - this.#displayCoords.y) * k) as Tile,
    );
    return this.#displayCoords;
  }
}
