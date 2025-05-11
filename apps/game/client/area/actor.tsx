import { Container, Text, ColorMatrixFilter } from "pixi.js";
import { Pixi } from "@mp/solid-pixi";
import { createEffect, createMemo, Show } from "solid-js";
import type { TiledResource } from "../../shared/area/tiled-resource";
import type { Actor } from "../../server/traits/actor";
import { createCharacterSprite } from "./character-sprite";

export function Actor(props: { tiled: TiledResource; actor: Actor }) {
  const position = createMemo(() =>
    props.tiled.tileCoordToWorld(props.actor.coords),
  );

  const container = new Container();
  const sprite = createCharacterSprite();
  const text = new Text({ scale: 0.25, anchor: { x: 0.5, y: 0 } });
  container.addChild(sprite);
  container.addChild(text);

  createEffect(() => {
    const { opacity, color } = props.actor;
    container.alpha = opacity ?? 1;
    container.filters = [createTintFilter(color)];
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

/**
 * Creates a ColorMatrixFilter that tints toward a given color.
 * @param color - 0xRRGGBB integer
 * @param strength - 0 (no effect) to 1 (full tint)
 */
function createTintFilter(
  color: number,
  strength: number = 0.25,
): ColorMatrixFilter {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;

  const inv = 1 - strength;

  const matrix: ColorMatrixFilter["matrix"] = [
    inv,
    0,
    0,
    0,
    r * strength,
    0,
    inv,
    0,
    0,
    g * strength,
    0,
    0,
    inv,
    0,
    b * strength,
    0,
    0,
    0,
    1,
    0,
  ];

  const filter = new ColorMatrixFilter();
  filter.matrix = matrix;
  return filter;
}
