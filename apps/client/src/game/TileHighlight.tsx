import type { FillStyle } from "@mp/pixi";
import type { AreaResource } from "@mp/data";
import { Graphics } from "@mp/pixi";
import { useContext } from "solid-js";
import { EngineContext, Pixi } from "@mp/pixi/solid";
import { getTilePosition } from "./getTilePosition";
import { effect } from "solid-js/web";

export interface TileHighlightProps {
  area: AreaResource;
}

export function TileHighlight({ area }: TileHighlightProps) {
  const engine = useContext(EngineContext);
  const gfx = new TileGraphics(area);

  effect(() => {
    const { isValidTarget, tilePosition } = getTilePosition(area, engine);
    const { x, y } = tilePosition.scale(area.tiled.tileSize);
    gfx.position.set(x, y);
    gfx.setStyle(isValidTarget ? visibleStyle : hiddenStyle);
  });

  return <Pixi instance={gfx} />;
}

class TileGraphics extends Graphics {
  constructor(private area: AreaResource) {
    super();

    this.setStyle(visibleStyle);
  }

  setStyle(style: FillStyle) {
    const { tilewidth, tileheight } = this.area.tiled.map;
    this.clear();
    this.fillStyle = style;
    this.rect(0, 0, tilewidth, tileheight);
    this.fill();
  }
}

const visibleStyle: FillStyle = { color: "rgba(100,100,100,0.5)" };
const hiddenStyle: FillStyle = { color: "rgba(0,0,0,0)" };
