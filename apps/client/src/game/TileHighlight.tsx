import type { FillStyle } from "@mp/pixi";
import type { AreaResource } from "@mp/data";
import { Graphics } from "@mp/pixi";
import { useContext } from "react";
import { EngineContext, Pixi } from "@mp/pixi/react";
import { useComputedValue } from "@mp/state";
import { getTilePosition } from "./getTilePosition";

export interface TileHighlightProps {
  area: AreaResource;
}

export function TileHighlight({ area }: TileHighlightProps) {
  const engine = useContext(EngineContext);
  const { isValidTarget, tilePosition } = useComputedValue(() =>
    getTilePosition(area, engine),
  );
  if (!isValidTarget) {
    return null;
  }
  return (
    <Pixi
      create={TileGraphics}
      area={area}
      update={(gfx) => {
        const { x, y } = tilePosition.scale(area.tiled.tileSize);
        gfx.position.set(x, y);
      }}
    />
  );
}

class TileGraphics extends Graphics {
  constructor({ area }: TileHighlightProps) {
    super();
    const { tilewidth, tileheight } = area.tiled.map;
    this.clear();
    this.fillStyle = tileStyle;
    this.rect(0, 0, tilewidth, tileheight);
    this.fill();
  }
}

const tileStyle: FillStyle = { color: "rgba(100,100,100,0.5)" };
