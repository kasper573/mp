import { Container, Graphics, Text } from "@mp/pixi";
import type { Vector } from "@mp/math";
import { Pixi } from "@mp/solid-pixi";
import type { TiledResource } from "@mp/data";
import { createEffect, Show } from "solid-js";
import type { MovementTrait, AppearanceTrait } from "@mp/server";
import type { Pixel } from "@mp/std";
import { useAnimatedCoords } from "../../state/useAnimatedCoords";

export type ActorTrait = MovementTrait & AppearanceTrait;

export function Actor(props: { tiled: TiledResource; actor: ActorTrait }) {
  const coords = useAnimatedCoords(() => props.actor);
  return (
    <Show when={coords()}>
      {(coords) => (
        <ActorGraphics
          tileSize={props.tiled.tileSize}
          color={props.actor.color}
          position={props.tiled.tileCoordToWorld(coords())}
          name={props.actor.name}
        />
      )}
    </Show>
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
  const text = new Text({
    text: "hi",
    scale: 0.25,
    anchor: { x: 0.5, y: 0 },
  });
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
