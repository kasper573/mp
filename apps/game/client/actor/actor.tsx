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
import { GameStateClientContext } from "../game-state-client";
import { ActorSprite } from "./actor-sprite";
import { ActorSpritesheetContext } from "./actor-spritesheet-lookup";

export function Actor(props: {
  tiled: TiledResource;
  actor: Actor;
  isPlayer?: boolean;
}) {
  const allSpritesheets = useContext(ActorSpritesheetContext);
  const { eventBus } = useContext(GameStateClientContext);
  const position = createMemo(() =>
    props.tiled.tileCoordToWorld(props.actor.coords),
  );
  const isMoving = createMemo(() => !!props.actor.path?.length);
  const isFast = createMemo(() => props.actor.speed >= 2);
  const isAlive = () => props.actor.health > 0;

  const sprite = new ActorSprite(
    // eslint-disable-next-line solid/reactivity
    isAlive() ? "idle-spear" : "death-spear",
  );

  const text = new Text({ scale: 0.25, anchor: { x: 0.5, y: 0 } });
  const container = new Container();
  container.addChild(sprite);
  container.addChild(text);

  createEffect(() => {
    sprite.spritesheets = assert(allSpritesheets.get(props.actor.modelId));
  });

  createEffect(() => (sprite.attackSpeed = props.actor.attackSpeed));

  createEffect(() => (sprite.direction = props.actor.dir));

  createEffect(() => {
    const { opacity, color } = props.actor;
    container.alpha = opacity ?? 1;
    if (color !== undefined) {
      sprite.filters = [createTintFilter(color)];
    }
  });

  createEffect(() => {
    const { name, health, maxHealth } = props.actor;
    text.text = name + `\n${health}/${maxHealth}`;
    if (props.actor.type === "character") {
      text.text += `\n${props.actor.xp}xp`;
    }
  });

  createEffect(() => {
    // Adjust draw order
    container.zIndex = props.actor.coords.y;
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

  onCleanup(
    // eslint-disable-next-line solid/reactivity
    eventBus.subscribe("combat.attack", (attack) => {
      if (attack.actorId === props.actor.id) {
        void sprite
          .playToEndAndStop("attack-spear")
          .then(switchAnimationToMovingOrIdle);
      }
    }),
  );

  onCleanup(
    // eslint-disable-next-line solid/reactivity
    eventBus.subscribe("actor.death", (deadActorId) => {
      if (deadActorId === props.actor.id) {
        void sprite.playToEndAndStop("death-spear");
      }
    }),
  );

  onCleanup(() => {
    sprite.destroy();
    container.destroy();
  });

  return (
    <Show when={position()}>
      {(pos) => (
        <Pixi
          label={`Actor (${props.actor.name}, ${props.actor.id})`}
          as={container}
          position={pos()}
        />
      )}
    </Show>
  );
}
