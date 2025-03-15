import type { FillStyle } from "@mp/pixi";
import type { AreaResource } from "@mp-modules/area";
import { Graphics } from "@mp/pixi";
import { createEffect } from "solid-js";
import { Pixi } from "@mp/solid-pixi";
import type { Rect } from "@mp/math";
import type { Tile } from "@mp/std";

export interface TileHighlightProps {
  area: AreaResource;
  target?: TileHighlightTarget;
}

export interface TileHighlightTarget {
  rect: Rect<Tile>;
  type: "attack" | "move";
}

export function TileHighlight(props: TileHighlightProps) {
  const gfx = new Graphics();

  createEffect(() => {
    gfx.clear();
    if (!props.target) {
      gfx.fillStyle = hiddenStyle;
      return;
    }

    const { tiled } = props.area;
    const { x, y } = tiled.tileCoordToWorld(props.target.rect);
    const width = tiled.tileUnitToWorld(props.target.rect.width);
    const height = tiled.tileUnitToWorld(props.target.rect.height);

    gfx.fillStyle = visibleStyles[props.target.type];
    gfx.position.set(x, y);
    gfx.rect(0, 0, width, height);
    gfx.fill();
  });

  return <Pixi as={gfx} />;
}

const visibleStyles: Record<TileHighlightTarget["type"], FillStyle> = {
  move: { color: "rgba(100,100,100,0.5)" },
  attack: { color: "rgba(0, 13, 197, 0.75)" },
};
const hiddenStyle: FillStyle = { color: "rgba(0,0,0,0)" };
