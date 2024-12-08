import { Graphics } from "@mp/pixi";
import type { Vector } from "@mp/math";
import { Pixi } from "@mp/solid-pixi";
import type { Character } from "@mp/server";
import type { TiledResource } from "@mp/data";
import { createEffect, Show } from "solid-js";
import { useAnimatedCoords } from "../../state/useAnimatedCoords.ts";

export function AutoPositionedCharacterActor(props: {
  tiled: TiledResource;
  char: Character;
}) {
  const coords = useAnimatedCoords(() => props.char);
  return (
    <Show when={coords()}>
      {(coords) => (
        <ManuallyPositionedCharacterActor
          tileSize={props.tiled.tileSize}
          position={props.tiled.tileCoordToWorld(coords())}
        />
      )}
    </Show>
  );
}

export function ManuallyPositionedCharacterActor(props: {
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
