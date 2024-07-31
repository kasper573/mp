import type { Engine, TiledResource, Vector, VectorLike } from "@mp/excalibur";
import { Keys, snapTileVector } from "@mp/excalibur";
import { Actor, Canvas } from "@mp/excalibur";
import {
  type DNode,
  type DGraph,
  vectorFromDNode,
  dNodeFromVector,
  addVectorToAdjacentInGraph,
} from "@mp/state";

export class DGraphDebugUI extends Actor {
  private path: VectorLike[] = [];
  private canvas: Canvas;
  private worldPos?: VectorLike;
  private showFractionalDNode = false;
  private showTiledDNode = false;

  constructor(
    graph: DGraph,
    private tiled: TiledResource,
    private renderDebugText: (text: string) => void,
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

        if (this.worldPos) {
          if (this.showTiledDNode) {
            drawDNode(
              ctx,
              tiled,
              graph,
              snapTileVector(tiled.worldCoordToTile(this.worldPos)),
            );
          }

          if (this.worldPos && this.showFractionalDNode) {
            const tilePos = tiled.worldCoordToTile(this.worldPos);
            drawDNode(
              ctx,
              tiled,
              addVectorToAdjacentInGraph(graph, tilePos),
              tilePos,
              tiled.tileCoordToWorld(tilePos),
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
    const { pointers, keyboard } = engine.input;
    this.worldPos = pointers.primary.lastWorldPos;
    this.showFractionalDNode = keyboard.isHeld(Keys.ShiftLeft);
    this.showTiledDNode = keyboard.isHeld(Keys.ControlLeft);

    if (keyboard.isHeld(Keys.ShiftLeft) || keyboard.isHeld(Keys.ControlLeft)) {
      const tilePos = this.tiled.worldCoordToTile(this.worldPos);
      const text = [
        `world: ${vecToString(this.worldPos)}`,
        `tile: ${vecToString(tilePos)}`,
        `tile (snapped): ${vecToString(snapTileVector(tilePos))}`,
      ].join("\n");
      this.renderDebugText(text);
    } else {
      this.renderDebugText("");
    }
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
  tilePos: Vector,
  start = tiled.tileCoordToWorld(tilePos),
) {
  for (const [neighbor, cost] of Object.entries(
    graph[dNodeFromVector(tilePos)] ?? {},
  )) {
    const end = tiled.tileCoordToWorld(vectorFromDNode(neighbor as DNode));
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "red";
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.strokeStyle = "black";
    ctx.strokeText(costToString(cost!), end.x, end.y, 10);
  }
}

function costToString(cost: number): string {
  const hasFractions = cost % 1 !== 0;
  return hasFractions ? cost.toFixed(1) : cost.toString();
}

function vecToString(v: VectorLike): string {
  return `(${v.x.toFixed(1)},${v.y.toFixed(1)})`;
}
