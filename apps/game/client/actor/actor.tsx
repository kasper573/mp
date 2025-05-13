import type { Spritesheet } from "pixi.js";
import { Container, Text } from "pixi.js";
import { Pixi } from "@mp/solid-pixi";
import {
  createContext,
  createEffect,
  createMemo,
  Show,
  useContext,
} from "solid-js";
import { assert } from "@mp/std";
import type { TiledResource } from "../../shared/area/tiled-resource";
import type { Actor } from "../../server/traits/actor";
import { createTintFilter } from "../tint-filter";
import { createCharacterSprite } from "./character-sprite";
import type {
  CharacterModelId,
  CharacterSpriteState,
} from "./character-sprite-state";
import { loopedCharacterSpriteStates } from "./character-sprite-state";
import { deriveCharacterSpriteState } from "./character-sprite-state-for-actor";

export function Actor(props: {
  tiled: TiledResource;
  actor: Actor;
  isPlayer?: boolean;
}) {
  const position = createMemo(() =>
    props.tiled.tileCoordToWorld(props.actor.coords),
  );

  const container = new Container();
  const allSpriteshets = useContext(CharacterSpritesheetContext);

  const state = createMemo(() => deriveCharacterSpriteState(props.actor));

  const sprite = createCharacterSprite(
    () => props.actor.facingAngle,
    () =>
      assert(
        allSpriteshets.get("adventurer" as CharacterModelId)?.get(state()),
      ),
  );

  createEffect(() => {
    sprite.loop = loopedCharacterSpriteStates.includes(state());
  });

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

export const CharacterSpritesheetContext = createContext(
  new Proxy(
    {} as ReadonlyMap<
      CharacterModelId,
      ReadonlyMap<CharacterSpriteState, Spritesheet>
    >,
    {
      get() {
        throw new Error("CharacterSpritesheetContext is not initialized");
      },
    },
  ),
);
