import type { FillStyle } from "@mp/pixi";
import type { AreaResource } from "@mp/data";
import { Graphics } from "@mp/pixi";
import { createEffect, useContext } from "solid-js";
import { Pixi } from "@mp/solid-pixi";
import { vec_scale, type Vector } from "@mp/math";
import { EngineContext } from "@mp/engine";
import type { Pixel } from "@mp/std";

export interface TileHighlightProps {
  area: AreaResource;
}

export function TileHighlight(props: TileHighlightProps) {
  const engine = useContext(EngineContext);
  const gfx = new TileHighlightGraphics();

  createEffect(() => {
    const { tileSize } = props.area.tiled;
    const tileNode = props.area.graph.getNearestNode(
      props.area.tiled.worldCoordToTile(engine.pointer.worldPosition),
    );
    if (tileNode) {
      const { x, y } = vec_scale(tileNode.data.vector, tileSize);
      gfx.position.set(x, y);
    }
    gfx.update(tileSize, !!tileNode);
  });

  return <Pixi as={gfx} />;
}

class TileHighlightGraphics extends Graphics {
  update(size: Vector<Pixel>, isVisible: boolean) {
    this.clear();
    this.fillStyle = isVisible ? visibleStyle : hiddenStyle;
    this.rect(0, 0, size.x, size.y);
    this.fill();
  }
}

const visibleStyle: FillStyle = { color: "rgba(100,100,100,0.5)" };
const hiddenStyle: FillStyle = { color: "rgba(0,0,0,0)" };
