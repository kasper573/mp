import { Container, Text } from "pixi.js";
import { Pixi } from "@mp/solid-pixi";
import {
  createEffect,
  createMemo,
  onCleanup,
  Show,
  untrack,
  useContext,
} from "solid-js";
import type { TiledResource } from "../../shared/area/tiled-resource";
import type { Actor } from "../../server/traits/actor";
import { createTintFilter } from "../tint-filter";
import { GameStateClientContext } from "../game-state-client";
import { deriveActorSpriteState } from "./derive-actor-sprite-state";
import { createActorSprite } from "./actor-sprite";

export function Actor(props: {
  tiled: TiledResource;
  actor: Actor;
  isPlayer?: boolean;
}) {
  const { eventBus } = useContext(GameStateClientContext);
  const position = createMemo(() =>
    props.tiled.tileCoordToWorld(props.actor.coords),
  );

  const container = new Container();

  const state = createMemo(() => deriveActorSpriteState(props.actor));

  const [sprite, spriteCommands] = createActorSprite(
    () => props.actor.modelId,
    () => props.actor.dir,
  );

  const text = new Text({ scale: 0.25, anchor: { x: 0.5, y: 0 } });
  container.addChild(sprite);
  container.addChild(text);

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

  createEffect(() => spriteCommands.setState(state()));

  onCleanup(
    eventBus.subscribe("combat.attack", (attack) => {
      if (attack.actorId === untrack(() => props.actor.id)) {
        spriteCommands.attack();
      }
    }),
  );

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
