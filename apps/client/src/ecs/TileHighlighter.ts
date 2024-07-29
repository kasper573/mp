import type { Engine, TiledResource, Vector } from "@mp/excalibur";
import { Actor, Canvas, floorVector } from "@mp/excalibur";
import { isVectorInGraph, type DGraph } from "@mp/state";

export class TileHighlighter extends Actor {
  private canvas: Canvas;
  private highlighted?: Vector;

  constructor(
    graph: DGraph,
    private tiled: TiledResource,
  ) {
    super();

    const { map } = this.tiled;
    this.canvas = new Canvas({
      width: map.width * map.tilewidth,
      height: map.height * map.tileheight,
      draw: (ctx) => {
        if (!isVectorInGraph(graph, this.highlighted)) {
          return;
        }

        const { x, y } = this.tiled.tileCoordToWorld(this.highlighted);
        ctx.beginPath();
        ctx.lineWidth = 5;
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.strokeStyle = "blue";
        ctx.stroke();
      },
    });
  }

  override onInitialize(): void {
    this.anchor.setTo(0, 0);
    this.graphics.use(this.canvas);
    this.canvas.flagDirty();
  }

  override update(engine: Engine): void {
    this.highlighted = floorVector(
      this.tiled.worldCoordToTile(engine.input.pointers.primary.lastWorldPos),
    );
  }
}
