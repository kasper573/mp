import type { TiledMap } from "@mp/excalibur";
import { Vector } from "@mp/excalibur";
import { Actor, Canvas } from "@mp/excalibur";
import { type PathGraphNodeId, type PathGraph, parseNodeId } from "@mp/state";

export class AreaDebugUI extends Actor {
  private enabledNodes = new Set<PathGraphNodeId>();
  private canvas: Canvas;

  constructor(
    private graph: PathGraph,
    map: TiledMap,
  ) {
    super();

    const scale = new Vector(map.tilewidth, map.tileheight);
    const offset = scale.scale(0.5);

    this.canvas = new Canvas({
      width: map.width * map.tilewidth,
      height: map.height * map.tileheight,
      cache: true,
      draw: (ctx) => {
        for (const node of this.enabledNodes) {
          const start = parseNodeId(node).scale(scale).add(offset);
          ctx.beginPath();
          ctx.lineWidth = 5;
          ctx.arc(start.x, start.y, 4, 0, 2 * Math.PI);
          ctx.strokeStyle = "red";
          ctx.stroke();

          for (const neighbor in this.graph[node] ?? {}) {
            const end = parseNodeId(neighbor as PathGraphNodeId)
              .scale(scale)
              .add(offset);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.lineWidth = 2;
            ctx.strokeStyle = "red";
            ctx.stroke();
          }
        }
      },
    });
  }

  override onInitialize(): void {
    this.anchor.setTo(0, 0);
    this.graphics.use(this.canvas);
    this.canvas.flagDirty();
  }

  toggleNode({ x, y }: Vector) {
    const nodeId: PathGraphNodeId = `${x}|${y}`;
    if (this.enabledNodes.has(nodeId)) {
      this.enabledNodes.delete(nodeId);
    } else {
      this.enabledNodes.add(nodeId);
    }
    this.canvas.flagDirty();
  }
}
