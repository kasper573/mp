import { Graphics } from "@mp/pixi";
import type { Vector } from "@mp/math";
import { Pixi } from "@mp/solid-pixi";
import type { TiledResource } from "@mp/data";
import { createEffect, Show } from "solid-js";
import type { MovementTrait, AppearanceTrait } from "@mp/server";
import { useAnimatedCoords } from "../../state/useAnimatedCoords";

export type Actor = MovementTrait & AppearanceTrait;

export function AutoPositionedActor(props: {
  tiled: TiledResource;
  subject: Actor;
}) {
  const coords = useAnimatedCoords(() => props.subject);
  return (
    <Show when={coords()}>
      {(coords) => (
        <ManuallyPositionedActor
          tileSize={props.tiled.tileSize}
          position={props.tiled.tileCoordToWorld(coords())}
        />
      )}
    </Show>
  );
}

export function ManuallyPositionedActor(props: {
  tileSize: Vector;
  position?: Vector;
}) {
  const gfx = new Graphics();

  createEffect(() => {
    const { x: width, y: height } = props.tileSize;
    gfx.clear();
    gfx.fillStyle.color = 0x00_ff_00;
    gfx.rect(-width / 2, -height / 2, width, height);
    gfx.fill();
  });

  return (
    <Show when={props.position}>
      {(pos) => <Pixi label="CharacterActor" as={gfx} position={pos()} />}
    </Show>
  );
}
