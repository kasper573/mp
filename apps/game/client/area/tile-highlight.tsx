import type { FillStyle } from "@mp/graphics";
import { Graphics } from "@mp/graphics";
import type { Rect } from "@mp/math";
import type { Tile } from "@mp/std";
import type { AreaResource } from "../../shared/area/area-resource";

export interface TileHighlightOptions {
  area: AreaResource;
  target?: TileHighlightTarget;
}

export interface TileHighlightTarget {
  rect: Rect<Tile>;
  type: "attack" | "move";
}

export class TileHighlight extends Graphics {
  constructor(private options: () => TileHighlightOptions) {
    super();

    this.onRender = this.#onRender;
  }

  #onRender = () => {
    this.clear();
    const { target, area } = this.options();
    if (!target) {
      this.fillStyle = hiddenStyle;
      return;
    }

    const { tiled } = area;
    const pos = tiled.tileCoordToWorld(target.rect.position);
    const width = tiled.tileToWorldUnit(target.rect.size.x);
    const height = tiled.tileToWorldUnit(target.rect.size.y);

    this.fillStyle = visibleStyles[target.type];
    this.position.set(pos.x, pos.y);
    this.rect(0, 0, width, height);
    this.fill();
  };
}

const visibleStyles: Record<TileHighlightTarget["type"], FillStyle> = {
  move: { color: "rgba(100,100,100,0.5)" },
  attack: { color: "rgba(0, 13, 197, 0.75)" },
};
const hiddenStyle: FillStyle = { color: "rgba(0,0,0,0)" };
