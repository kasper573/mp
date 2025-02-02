import { Container, Graphics, Text } from "@mp/pixi";
import type { Vector } from "@mp/math";
import { Pixi } from "@mp/solid-pixi";
import type { TiledResource } from "@mp/data";
import { createEffect, Show } from "solid-js";
import type { AppearanceTrait, Actor } from "@mp/server";
import type { Pixel, Tile } from "@mp/std";
import { useAnimatedCoords } from "../../state/useAnimatedCoords";

export function Actor(props: { tiled: TiledResource; actor: Actor }) {
  const coords = useAnimatedCoords(
    () => props.actor.coords,
    () => props.actor.path,
    () => props.actor.speed,
    () => 2 as Tile, // Magic number, no reason other than it seems to work well
  );
  return (
    <ActorGraphics
      tileSize={props.tiled.tileSize}
      color={props.actor.color}
      position={props.tiled.tileCoordToWorld(coords())}
      name={props.actor.name}
    />
  );
}

function ActorGraphics(
  props: {
    tileSize: Vector<Pixel>;
    position?: Vector<Pixel>;
  } & AppearanceTrait,
) {
  const container = new Container();
  const gfx = new Graphics();
  const text = new Text({ scale: 0.25, anchor: { x: 0.5, y: 0 } });
  container.addChild(gfx);
  container.addChild(text);

  createEffect(() => {
    const { x: width, y: height } = props.tileSize;
    gfx.clear();
    gfx.fillStyle.color = props.color;
    gfx.rect(-width / 2, -height / 2, width, height);
    gfx.fill();
  });

  createEffect(() => {
    text.text = props.name;
  });

  return (
    <Show when={props.position}>
      {(pos) => <Pixi label="Actor" as={container} position={pos()} />}
    </Show>
  );
}
