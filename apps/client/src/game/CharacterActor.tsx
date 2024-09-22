import type { Engine } from "@mp/pixi";
import { Graphics } from "@mp/pixi";
import type { Size, Vector, VectorLike } from "@mp/math";
import { Interpolator } from "./Interpolator";
import { Pixi } from "@mp/pixi/solid";
import { Accessor } from "solid-js";
import { Character } from "@mp/server";
import { effect } from "solid-js/web";
import { AreaResource } from "@mp/data";

export function CharacterActor({
  char,
  area,
}: {
  char: Character;
  area: AreaResource;
}) {
  const gfx = new CharacterGraphics(area.tiled.tileSize);
  const lerp = new Interpolator(gfx);
  effect(() => {
    lerp.configure(area.tiled.tileCoordToWorld(char.coords), {
      path: char.path?.map(area.tiled.tileCoordToWorld) ?? [],
      speed: area.tiled.tileUnitToWorld(char.speed),
    });
  });
  return <Pixi instance={gfx} />;
}

class CharacterGraphics extends Graphics {
  constructor(tileSize: VectorLike) {
    super();

    this.fillStyle.color = 0x00ff00;
    this.rect(-tileSize.x / 2, -tileSize.y / 2, tileSize.x, tileSize.y);
    this.fill();
  }
}
