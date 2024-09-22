import { Graphics } from "@mp/pixi";
import type { VectorLike } from "@mp/math";
import { Pixi } from "@mp/pixi/solid";
import type { Character } from "@mp/server";
import type { AreaResource } from "@mp/data";
import { createEffect } from "solid-js";
import { Interpolator } from "./Interpolator";

export function CharacterActor(props: { char: Character; area: AreaResource }) {
  const gfx = new CharacterGraphics();
  const lerp = new Interpolator(gfx);

  createEffect(() => {
    const { tiled } = props.area;
    const { path, coords, speed } = props.char;
    gfx.update(tiled.tileSize);
    lerp.configure(tiled.tileCoordToWorld(coords), {
      path: path?.map(tiled.tileCoordToWorld) ?? [],
      speed: tiled.tileUnitToWorld(speed),
    });
  });

  return <Pixi instance={gfx} />;
}

class CharacterGraphics extends Graphics {
  update(tileSize: VectorLike) {
    this.clear();
    this.fillStyle.color = 0x00ff00;
    this.rect(-tileSize.x / 2, -tileSize.y / 2, tileSize.x, tileSize.y);
    this.fill();
  }
}
