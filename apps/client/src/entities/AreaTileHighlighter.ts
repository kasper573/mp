import type { TiledMap } from "@mp/excalibur";
import { Vector } from "@mp/excalibur";
import { Actor, Canvas } from "@mp/excalibur";
import { createNodeId, type PathGraph } from "@mp/state";

export class AreaTileHighlighter extends Actor {
  private canvas: Canvas;
  private highlighted?: Vector;

  constructor(graph: PathGraph, map: TiledMap) {
    super();

    this.canvas = new Canvas({
      width: map.width * map.tilewidth,
      height: map.height * map.tileheight,
      cache: true,
      draw: (ctx) => {
        // Only draw highlight for locations that are available in the DGraph
        if (this.highlighted && graph[createNodeId(this.highlighted)]) {
          drawHighlight(ctx, map, this.highlighted);
        }
      },
    });
  }

  override onInitialize(): void {
    this.anchor.setTo(0, 0);
    this.graphics.use(this.canvas);
    this.canvas.flagDirty();
  }

  setHighlighted(highlighted?: Vector) {
    this.highlighted = highlighted;
    this.canvas.flagDirty();
  }
}

function drawHighlight(
  ctx: CanvasRenderingContext2D,
  map: TiledMap,
  tile: Vector,
): void {
  const scale = new Vector(map.tilewidth, map.tileheight);
  const offset = scale.scale(0.5);
  tile = tile.scale(scale).add(offset);

  ctx.beginPath();
  ctx.lineWidth = 5;
  ctx.arc(tile.x, tile.y, 4, 0, 2 * Math.PI);
  ctx.strokeStyle = "blue";
  ctx.stroke();
}
