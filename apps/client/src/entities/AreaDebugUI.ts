import type { TiledMap, VectorLike } from "@mp/excalibur";
import { Vector } from "@mp/excalibur";
import { Actor, Canvas } from "@mp/excalibur";
import type { Coordinate } from "@mp/server";
import { type PathGraphNodeId, type PathGraph, parseNodeId } from "@mp/state";

export class AreaDebugUI extends Actor {
  private enabledNodes = new Set<PathGraphNodeId>();
  private currentPath: Coordinate[] = [];
  private canvas: Canvas;

  constructor(graph: PathGraph, map: TiledMap) {
    super();

    this.canvas = new Canvas({
      width: map.width * map.tilewidth,
      height: map.height * map.tileheight,
      cache: true,
      draw: (ctx) =>
        drawDebugGraphics(ctx, graph, map, this.currentPath, this.enabledNodes),
    });
  }

  override onInitialize(): void {
    this.anchor.setTo(0, 0);
    this.graphics.use(this.canvas);
    this.canvas.flagDirty();
  }

  setPath(path: Coordinate[]) {
    this.currentPath = path;
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

function costToString(cost: number): string {
  const hasFractions = cost % 1 !== 0;
  return hasFractions ? cost.toFixed(1) : cost.toString();
}

function drawDebugGraphics(
  ctx: CanvasRenderingContext2D,
  graph: PathGraph,
  map: TiledMap,
  currentPath: Coordinate[],
  nodes: Iterable<PathGraphNodeId>,
): void {
  const scale = new Vector(map.tilewidth, map.tileheight);
  const offset = scale.scale(0.5);
  const transform = (v: VectorLike) =>
    new Vector(v.x, v.y).scale(scale).add(offset);

  for (const node of nodes) {
    const start = transform(parseNodeId(node));
    ctx.beginPath();
    ctx.lineWidth = 5;
    ctx.arc(start.x, start.y, 4, 0, 2 * Math.PI);
    ctx.strokeStyle = "red";
    ctx.stroke();

    for (const [neighbor, cost] of Object.entries(graph[node] ?? {})) {
      const end = transform(parseNodeId(neighbor as PathGraphNodeId));
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "red";
      ctx.stroke();

      ctx.lineWidth = 1;
      ctx.strokeStyle = "black";
      ctx.strokeText(costToString(cost!), end.x, end.y);
    }
  }

  if (currentPath.length > 1) {
    const [start, ...rest] = currentPath.map(transform);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "purple";
    for (const { x, y } of rest) {
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
