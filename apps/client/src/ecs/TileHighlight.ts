import type { FillStyle } from "@mp/pixi";
import type { TiledResource } from "@mp/state";
import { snapTileVector } from "@mp/state";
import { Graphics } from "@mp/pixi";
import { isVectorInGraph, type DGraph } from "@mp/state";
import { engine } from "./engine";

export class TileHighlight extends Graphics {
  constructor(
    private graph: DGraph,
    private tiled: TiledResource,
  ) {
    super();

    this.fillStyle = visibleStyle;
    this.rect(0, 0, tiled.map.width, tiled.map.height);
    this.fill();
  }

  override _onRender = () => {
    const { lastWorldPos } = engine.input.pointer;
    const tilePos = snapTileVector(this.tiled.worldCoordToTile(lastWorldPos));
    const worldPos = tilePos.scale(this.tiled.tileSize);
    this.position.set(worldPos.x, worldPos.y);

    const visible = isVectorInGraph(this.graph, tilePos);
    this.fillStyle = visible ? visibleStyle : hiddenStyle;
  };
}

const visibleStyle: FillStyle = { color: "rgba(100,100,100,0.5)" };
const hiddenStyle: FillStyle = { color: "rgba(0,0,0,0)" };
