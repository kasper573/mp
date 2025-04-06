import type { FillStyle } from "@mp/pixi";
import { Graphics } from "@mp/pixi";
import { createEffect } from "solid-js";
import { Pixi } from "@mp/solid-pixi";
import { type Rect } from "@mp/math";
import type { Tile } from "@mp/std";
import type { AreaResource } from "@mp-modules/game";

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
    const pos = tiled.tileCoordToWorld(props.target.rect.position);
    const width = tiled.tileToWorldUnit(props.target.rect.size.x);
    const height = tiled.tileToWorldUnit(props.target.rect.size.y);

    gfx.fillStyle = visibleStyles[props.target.type];
    gfx.position.set(pos.x, pos.y);
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
