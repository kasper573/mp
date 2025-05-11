import { Container, Text } from "pixi.js";
import { Pixi } from "@mp/solid-pixi";
import { createEffect, createMemo, Show } from "solid-js";
import type { TiledResource } from "../../shared/area/tiled-resource";
import type { Actor } from "../../server/traits/actor";
import { createCharacterSprite } from "../character/character-sprite";
import { createTintFilter } from "../tint-filter";
import { loadCharacterSpritesheetForState } from "../character/character-sprite-state";

export function Actor(props: {
  tiled: TiledResource;
  actor: Actor;
  showAngle?: boolean;
}) {
  const position = createMemo(() =>
    props.tiled.tileCoordToWorld(props.actor.coords),
  );

  const container = new Container();

  const sprite = createCharacterSprite(
    () => props.actor.facingAngle,
    () => walk,
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
  });

  return (
    <Show when={position()}>
      {(pos) => <Pixi label="Actor" as={container} position={pos()} />}
    </Show>
  );
}

const walk = await loadCharacterSpritesheetForState("walk-normal");
