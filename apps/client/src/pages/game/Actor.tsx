import { Graphics } from "@mp/pixi";
import type { Vector } from "@mp/math";
import { Pixi } from "@mp/solid-pixi";
import type { TiledResource } from "@mp/data";
import { createEffect, Show } from "solid-js";
import type { MovementTrait, AppearanceTrait } from "@mp/server";
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
        />
      )}
    </Show>
  );
}

function ActorGraphics(props: {
  tileSize: Vector;
  position?: Vector;
  color: number;
}) {
  const gfx = new Graphics();

  createEffect(() => {
    const { x: width, y: height } = props.tileSize;
    gfx.clear();
    gfx.fillStyle.color = props.color;
    gfx.rect(-width / 2, -height / 2, width, height);
    gfx.fill();
  });

  return (
    <Show when={props.position}>
      {(pos) => <Pixi label="Actor" as={gfx} position={pos()} />}
    </Show>
  );
}
