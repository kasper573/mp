import type { AreaResource, TiledResource } from "@mp/data";
import { snapTileVector } from "@mp/data";
import { Vector, type Path } from "@mp/math";
import {
  type DNode,
  type DGraph,
  vectorFromDNode,
  dNodeFromVector,
  addVectorToAdjacentInGraph,
} from "@mp/data";
import { Graphics } from "@mp/pixi";
import type { Accessor } from "solid-js";
import { createEffect, createSignal, useContext } from "solid-js";
import { EngineContext, Pixi } from "@mp/pixi/solid";
import * as styles from "./DGraphDebugUI.css";

export function DGraphDebugUI(props: {
  area: AreaResource;
  pathToDraw: Accessor<Path | undefined>;
}) {
  const [debugText, setDebugText] = createSignal("");
  const engine = useContext(EngineContext);
  const gfx = new Graphics();

  createEffect(() => {
    const { tiled, dGraph } = props.area;
    const allTileCoords = generateAllTileCoords(
      tiled.map.width,
      tiled.map.height,
    );

    const {
      pointer: { worldPosition, position: viewportPosition },
      keyboard: { keysHeld },
    } = engine;

    gfx.clear();

    if (keysHeld.has("Control") && keysHeld.has("Shift")) {
      for (const pos of allTileCoords) {
        drawDNode(gfx, tiled, dGraph, pos);
      }
    } else if (keysHeld.has("Control")) {
      drawDNode(
        gfx,
        tiled,
        dGraph,
        snapTileVector(tiled.worldCoordToTile(worldPosition)),
      );
    }

    if (keysHeld.has("Shift")) {
      const tilePos = tiled.worldCoordToTile(worldPosition);
      drawDNode(
        gfx,
        tiled,
        addVectorToAdjacentInGraph(dGraph, tilePos),
        tilePos,
        tiled.tileCoordToWorld(tilePos),
      );
    }

    if (keysHeld.has("Shift") || keysHeld.has("Control")) {
      if (props.pathToDraw()?.length) {
        drawPath(gfx, tiled, props.pathToDraw() ?? []);
      }

      const tilePos = tiled.worldCoordToTile(worldPosition);
      const text = [
        `viewport: ${vecToString(viewportPosition)}`,
        `world: ${vecToString(worldPosition)}`,
        `tile: ${vecToString(tilePos)}`,
        `tile (snapped): ${vecToString(snapTileVector(tilePos))}`,
        `camera transform: ${JSON.stringify(engine.camera.transform.data, null, 2)}`,
      ].join("\n");
      setDebugText(text);
    } else {
      setDebugText("");
    }
  });

  return (
    <Pixi instance={gfx}>
      <span class={styles.debugText({ visible: !!debugText() })}>
        {debugText()}
      </span>
    </Pixi>
  );
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
