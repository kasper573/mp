import type { FillStyle } from "@mp/pixi";
import type { AreaResource } from "@mp/data";
import { Graphics } from "@mp/pixi";
import { createEffect, useContext } from "solid-js";
import { EngineContext, Pixi } from "@mp/pixi/solid";
import type { Vector } from "@mp/math";
import { getTilePosition } from "./getTilePosition";

export interface TileHighlightProps {
  area: AreaResource;
}

export function TileHighlight(props: TileHighlightProps) {
  const engine = useContext(EngineContext);
  const gfx = new TileGraphics();

  createEffect(() => {
    const { tileSize } = props.area.tiled;
    const { isValidTarget, tilePosition } = getTilePosition(props.area, engine);
    const { x, y } = tilePosition.scale(tileSize);
    gfx.position.set(x, y);
    gfx.update(tileSize, isValidTarget);
  });

  return <Pixi instance={gfx} />;
}

class TileGraphics extends Graphics {
  update(size: Vector, isVisible: boolean) {
    this.clear();
    this.fillStyle = isVisible ? visibleStyle : hiddenStyle;
    this.rect(0, 0, size.x, size.y);
    this.fill();
  }
}

const visibleStyle: FillStyle = { color: "rgba(100,100,100,0.5)" };
const hiddenStyle: FillStyle = { color: "rgba(0,0,0,0)" };