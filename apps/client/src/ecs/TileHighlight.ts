import type { FillStyle } from "@mp/pixi";
import type { TiledResource } from "@mp/state";
import { snapTileVector } from "@mp/state";
import { Graphics } from "@mp/pixi";
import { isVectorInGraph, type DGraph } from "@mp/state";
import { Engine } from "../../../../packages/pixi/src/engine";

export class TileHighlight extends Graphics {
  constructor(
    private graph: DGraph,
    private tiled: TiledResource,
  ) {
    super();
  }

  override _onRender = () => {
    const { lastWorldPosition } = Engine.instance.input.pointer;
    const tilePos = snapTileVector(
      this.tiled.worldCoordToTile(lastWorldPosition),
    );
    const worldPos = tilePos.scale(this.tiled.tileSize);
    this.position.set(worldPos.x, worldPos.y);

    const visible = isVectorInGraph(this.graph, tilePos);
    const newFillStyle = visible ? visibleStyle : hiddenStyle;
    if (this.fillStyle !== newFillStyle) {
      this.clear();
      this.fillStyle = newFillStyle;
      this.rect(0, 0, this.tiled.map.tilewidth, this.tiled.map.tileheight);
      this.fill();
    }
  };
}

const visibleStyle: FillStyle = { color: "rgba(100,100,100,0.5)" };
const hiddenStyle: FillStyle = { color: "rgba(0,0,0,0)" };
