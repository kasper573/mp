import { Container, Text } from "pixi.js";
import { Pixi } from "@mp/solid-pixi";
import {
  createEffect,
  createMemo,
  onCleanup,
  Show,
  useContext,
} from "solid-js";
import { assert } from "@mp/std";
import type { TiledResource } from "../../shared/area/tiled-resource";
import type { Actor } from "../../server/actor";
import { createTintFilter } from "../tint-filter";
import { useSyncEntity } from "../use-sync";
import { GameStateClientContext } from "../game-state/solid-js";
import { ActorSprite } from "./actor-sprite";
import { ActorSpritesheetContext } from "./actor-spritesheet-lookup";

export function Actor(props: { tiled: TiledResource; actor: Actor }) {
  const allSpritesheets = useContext(ActorSpritesheetContext);
  const actor = useSyncEntity(() => props.actor);
  const state = useContext(GameStateClientContext);
  const position = createMemo(() => props.tiled.tileCoordToWorld(actor.coords));
  const isMoving = createMemo(() => !!actor.path?.length);
  const isFast = createMemo(() => actor.speed >= 2);
  const isAlive = () => actor.health > 0;

  const sprite = new ActorSprite(isAlive() ? "idle-spear" : "death-spear");

  const text = new Text({ scale: 0.25, anchor: { x: 0.5, y: 0 } });
  const container = new Container();

  container.addChild(sprite);
  container.addChild(text);

  createEffect(() => {
    sprite.spritesheets = assert(allSpritesheets.get(actor.modelId));
  });

  createEffect(() => (sprite.attackSpeed = actor.attackSpeed));

  createEffect(() => (sprite.direction = actor.dir));

  createEffect(() => {
    container.alpha = actor.opacity ?? 1;
    if (actor.color !== undefined) {
      sprite.filters = [createTintFilter(actor.color)];
    }
  });

  createEffect(() => {
    text.text = actor.name + `\n${actor.health}/${actor.maxHealth}`;
    if (actor.type === "character") {
      text.text += `\n${actor.xp}xp`;
    }
  });

  createEffect(() => {
    // Adjust draw order
    container.zIndex = actor.coords.y;
  });

  function switchAnimationToMovingOrIdle() {
    if (isAlive()) {
      if (isMoving()) {
        sprite.switchAnimationSmoothly(isFast() ? "run-spear" : "walk-spear");
      } else {
        sprite.switchAnimationSmoothly("idle-spear");
      }
    }
  }

  createEffect(switchAnimationToMovingOrIdle);

  createEffect(() => {
    onCleanup(
      // eslint-disable-next-line solid/reactivity
      state().eventBus.subscribe("combat.attack", (attack) => {
        if (attack.actorId === actor.id) {
          void sprite
            .playToEndAndStop("attack-spear")
            .then(switchAnimationToMovingOrIdle);
        }
      }),
    );

    onCleanup(
      state().eventBus.subscribe("actor.death", (deadActorId) => {
        if (deadActorId === actor.id) {
          void sprite.playToEndAndStop("death-spear");
        }
      }),
    );
  });

  onCleanup(() => {
    sprite.destroy();
    container.destroy();
  });

  return (
    <Show when={position()}>
      {(pos) => (
        <Pixi
          label={`Actor (${actor.name}, ${actor.id})`}
          as={container}
          position={pos()}
        />
      )}
    </Show>
  );
}
