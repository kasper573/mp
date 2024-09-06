import type { TiledResource } from "@mp/state";
import { snapTileVector } from "@mp/state";
import { Vector, type Path } from "@mp/math";
import {
  type DNode,
  type DGraph,
  vectorFromDNode,
  dNodeFromVector,
  addVectorToAdjacentInGraph,
} from "@mp/state";
import { Graphics } from "@mp/pixi";
import { Engine } from "./Engine";

export class DGraphDebugUI extends Graphics {
  private pathToDraw: Path = [];
  private allTileCoords: Vector[];

  constructor(
    private graph: DGraph,
    private tiled: TiledResource,
    private renderDebugText: (text: string) => void,
  ) {
    super();
    this.allTileCoords = generateAllTileCoords(
      tiled.map.width,
      tiled.map.height,
    );
  }

  showPath(path: Vector[]) {
    this.pathToDraw = path;
  }

  override _onRender = () => {
    const {
      pointer: { lastWorldPosition, lastScreenPosition },
      keyboard,
    } = Engine.instance.input;

    this.clear();

    if (this.pathToDraw.length) {
      drawPath(this, this.tiled, this.pathToDraw);
    }

    if (keyboard.isHeld("Control") && keyboard.isHeld("Shift")) {
      for (const pos of this.allTileCoords) {
        drawDNode(this, this.tiled, this.graph, pos);
      }
    } else if (keyboard.isHeld("Control")) {
      drawDNode(
        this,
        this.tiled,
        this.graph,
        snapTileVector(this.tiled.worldCoordToTile(lastWorldPosition)),
      );
    }

    if (keyboard.isHeld("Shift")) {
      const tilePos = this.tiled.worldCoordToTile(lastWorldPosition);
      drawDNode(
        this,
        this.tiled,
        addVectorToAdjacentInGraph(this.graph, tilePos),
        tilePos,
        this.tiled.tileCoordToWorld(tilePos),
      );
    }

    if (keyboard.isHeld("Shift") || keyboard.isHeld("Control")) {
      const tilePos = this.tiled.worldCoordToTile(lastWorldPosition);
      const text = [
        `screen: ${vecToString(lastScreenPosition)}`,
        `world: ${vecToString(lastWorldPosition)}`,
        `camera rect: ${Engine.instance.camera.rect.toString()}`,
        `tile: ${vecToString(tilePos)}`,
        `tile (snapped): ${vecToString(snapTileVector(tilePos))}`,
      ].join("\n");
      this.renderDebugText(text);
    } else {
      this.renderDebugText("");
    }
  };
}

function drawPath(ctx: Graphics, tiled: TiledResource, path: Vector[]) {
  const [start, ...rest] = path.map(tiled.tileCoordToWorld);

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.strokeStyle = { width: 1, color: "purple" };
  for (const { x, y } of rest) {
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawDNode(
  ctx: Graphics,
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
    ctx.strokeStyle = { width: 2, color: "red" };
    ctx.stroke();

    ctx.strokeStyle = { width: 1, color: "black" };
    //ctx.strokeText(costToString(cost!), end.x, end.y, 10);
  }
}

function costToString(cost: number): string {
  const hasFractions = cost % 1 !== 0;
  return hasFractions ? cost.toFixed(1) : cost.toString();
}

function vecToString(v: Vector): string {
  return `(${v.x.toFixed(1)},${v.y.toFixed(1)})`;
}

function generateAllTileCoords(width: number, height: number): Vector[] {
  const result: Vector[] = [];
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      result.push(new Vector(x, y));
    }
  }
  return result;
}
