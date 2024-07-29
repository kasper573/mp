import type { Engine, TiledResource, VectorLike } from "@mp/excalibur";
import { floorVector, Keys } from "@mp/excalibur";
import { Actor, Canvas } from "@mp/excalibur";
import {
  type DNode,
  type DGraph,
  vectorFromDNode,
  dNodeFromVector,
  addVectorToAdjacentInGraph,
} from "@mp/state";

export class AreaDebugUI extends Actor {
  private path: VectorLike[] = [];
  private canvas: Canvas;
  private pointerPos?: VectorLike;
  private showFractionalDNode = false;
  private showTiledDNode = false;

  constructor(
    graph: DGraph,
    private tiled: TiledResource,
  ) {
    super();

    const { map } = tiled;
    this.canvas = new Canvas({
      width: map.width * map.tilewidth,
      height: map.height * map.tileheight,
      draw: (ctx) => {
        if (this.path.length) {
          drawPath(ctx, tiled, this.path);
        }

        if (this.pointerPos) {
          const tilePos = tiled.worldCoordToTile(this.pointerPos);

          if (this.showTiledDNode) {
            drawDNode(ctx, tiled, graph, dNodeFromVector(floorVector(tilePos)));
          }

          if (this.pointerPos && this.showFractionalDNode) {
            drawDNode(
              ctx,
              tiled,
              addVectorToAdjacentInGraph(graph, tilePos),
              dNodeFromVector(tilePos),
            );
          }
        }
      },
    });
  }

  override onInitialize(): void {
    this.anchor.setTo(0, 0);
    this.graphics.use(this.canvas);
  }

  showPath(path: VectorLike[]) {
    this.path = path;
  }

  override update(engine: Engine): void {
    this.pointerPos = engine.input.pointers.primary.lastWorldPos;
    this.showFractionalDNode = engine.input.keyboard.isHeld(Keys.ShiftLeft);
    this.showTiledDNode = engine.input.keyboard.isHeld(Keys.ControlLeft);
  }
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  tiled: TiledResource,
  path: VectorLike[],
) {
  const [start, ...rest] = path.map(tiled.tileCoordToWorld);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "purple";
  for (const { x, y } of rest) {
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawDNode(
  ctx: CanvasRenderingContext2D,
  tiled: TiledResource,
  graph: DGraph,
  node: DNode,
) {
  const start = tiled.tileCoordToWorld(vectorFromDNode(node));
  for (const [neighbor, cost] of Object.entries(graph[node] ?? {})) {
    const end = tiled.tileCoordToWorld(vectorFromDNode(neighbor as DNode));
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

function costToString(cost: number): string {
  const hasFractions = cost % 1 !== 0;
  return hasFractions ? cost.toFixed(1) : cost.toString();
}
