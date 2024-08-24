import type { Engine } from "@mp/pixi";
import type { TiledResource } from "@mp/state";
import { snapTileVector } from "@mp/state";
import { Actor, Color, Rectangle } from "@mp/pixi";
import { isVectorInGraph, type DGraph } from "@mp/state";

export class TileHighlight extends Actor {
  private rect!: Rectangle;

  constructor(
    private graph: DGraph,
    private tiled: TiledResource,
  ) {
    super();

    const { map } = this.tiled;
    this.rect = new Rectangle({
      width: map.tilewidth,
      height: map.tileheight,
      color,
    });
  }

  override onInitialize(): void {
    this.anchor.setTo(0, 0);
    this.graphics.use(this.rect);
  }

  override update(engine: Engine): void {
    const { lastWorldPos } = engine.input.pointers.primary;
    const tilePos = snapTileVector(this.tiled.worldCoordToTile(lastWorldPos));
    this.pos = tilePos.scale(this.tiled.tileSize);

    const visible = isVectorInGraph(this.graph, tilePos);
    this.rect.color = visible ? color : Color.Transparent;
  }
}

const color = new Color(100, 100, 150, 0.25);
