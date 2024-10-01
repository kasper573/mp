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
import { createEffect, createMemo, Show, useContext } from "solid-js";
import { Pixi } from "@mp/solid-pixi";
import { EngineContext } from "@mp/engine";
import type { Character } from "@mp/server";
import { myCharacter, useServerVersion } from "../state/signals";
import { env } from "../env";
import * as styles from "./AreaDebugUI.css";

export function AreaDebugUI(props: {
  area: AreaResource;
  pathToDraw: Path | undefined;
}) {
  const engine = useContext(EngineContext);
  const isVisible = createMemo(
    () =>
      engine.keyboard.keysHeld.has("Control") ||
      engine.keyboard.keysHeld.has("Shift"),
  );

  return (
    <Pixi label="AreaDebugUI" isRenderGroup>
      <Show when={isVisible()}>
        <DebugDGraph area={props.area} />
        <DebugPath tiled={props.area.tiled} path={props.pathToDraw} />
        <DebugText tiled={props.area.tiled} path={props.pathToDraw} />
      </Show>
    </Pixi>
  );
}

function DebugDGraph(props: { area: AreaResource }) {
  const gfx = new Graphics();
  const engine = useContext(EngineContext);
  const allTileCoords = createMemo(() =>
    generateAllTileCoords(
      props.area.tiled.map.width,
      props.area.tiled.map.height,
    ),
  );

  createEffect(() => {
    gfx.clear();
    const { tiled, dGraph } = props.area;
    const { keysHeld } = engine.keyboard;

    if (keysHeld.has("Control") && keysHeld.has("Shift")) {
      for (const pos of allTileCoords()) {
        drawDNode(gfx, tiled, dGraph, pos);
      }
    } else if (keysHeld.has("Control")) {
      drawDNode(
        gfx,
        tiled,
        dGraph,
        snapTileVector(tiled.worldCoordToTile(engine.pointer.worldPosition)),
      );
    } else if (keysHeld.has("Shift")) {
      const tilePos = tiled.worldCoordToTile(engine.pointer.worldPosition);
      drawDNode(
        gfx,
        tiled,
        addVectorToAdjacentInGraph(dGraph, tilePos),
        tilePos,
        tiled.tileCoordToWorld(tilePos),
      );
    }
  });

  return <Pixi label="DGraphDebugUI" as={gfx} />;
}

function DebugPath(props: { tiled: TiledResource; path: Path | undefined }) {
  const gfx = new Graphics();

  createEffect(() => {
    gfx.clear();
    if (props.path?.length) {
      drawPath(gfx, props.tiled, props.path);
    }
  });

  return <Pixi label="PathDebugUI" as={gfx} />;
}

function DebugText(props: { tiled: TiledResource; path: Path | undefined }) {
  const engine = useContext(EngineContext);
  const serverVersion = useServerVersion();
  const text = createMemo(() => {
    const { worldPosition, position: viewportPosition } = engine.pointer;
    const tilePos = props.tiled.worldCoordToTile(worldPosition);
    return [
      `build: (client: ${env.buildVersion}, server: ${serverVersion.data})`,
      `viewport: ${vecToString(viewportPosition)}`,
      `world: ${vecToString(worldPosition)}`,
      `tile: ${vecToString(tilePos)}`,
      `tile (snapped): ${vecToString(snapTileVector(tilePos))}`,
      `camera transform: ${JSON.stringify(engine.camera.transform.data, null, 2)}`,
      `character: ${JSON.stringify(trimCharacterInfo(myCharacter()), null, 2)}`,
      `fps deltaTime: ${engine.deltaTime.totalMilliseconds.toFixed(2)}ms`,
    ].join("\n");
  });

  return <span class={styles.debugText}>{text()}</span>;
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
  for (const [neighbor] of Object.entries(
    graph[dNodeFromVector(tilePos)] ?? {},
  )) {
    const end = tiled.tileCoordToWorld(vectorFromDNode(neighbor as DNode));
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = { width: 2, color: "red" };
    ctx.stroke();
    ctx.strokeStyle = { width: 1, color: "black" };
  }
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

function trimCharacterInfo(char?: Character) {
  return (
    char && {
      ...char,
      coords: vecToString(char.coords),
      path: char.path?.map(vecToString).join(" -> "),
    }
  );
}

function vecToString(v: Vector): string {
  return `${v.x.toFixed(1)}, ${v.y.toFixed(1)}`;
}
