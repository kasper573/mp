import type { AreaResource, TiledResource } from "@mp/data";
import { vec, vec_round, type Path, type Vector } from "@mp/math";
import { type Graph, addVectorToAdjacentInGraph } from "@mp/path-finding";
import { Graphics } from "@mp/pixi";
import type { Accessor } from "solid-js";
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  useContext,
} from "solid-js";
import { Pixi } from "@mp/solid-pixi";
import { EngineContext } from "@mp/engine";
import type { Character } from "@mp/server";
import type { TimeSpan } from "@mp/time";
import { env } from "../../env";
import { useServerVersion } from "../../state/useServerVersion";
import { SyncClientContext } from "../../integrations/sync";
import { Select } from "../../ui/Select";
import * as styles from "./AreaDebugUI.css";

const visibleGraphTypes = ["none", "all", "tile", "coord"] as const;
type VisibleGraphType = (typeof visibleGraphTypes)[number];

export function AreaDebugUI(props: {
  area: AreaResource;
  pathToDraw: Path | undefined;
}) {
  const [visibleGraphType, setVisibleGraphType] =
    createSignal<VisibleGraphType>("none");

  return (
    <Pixi label="AreaDebugUI" isRenderGroup>
      <DebugGraph area={props.area} visible={visibleGraphType} />
      <DebugPath tiled={props.area.tiled} path={props.pathToDraw} />
      <div class={styles.debugMenu}>
        <div>
          Visible Graph lines:{" "}
          <Select
            options={visibleGraphTypes}
            value={visibleGraphType()}
            onChange={setVisibleGraphType}
            on:pointerdown={(e) => e.stopPropagation()}
          />
        </div>
        <DebugText tiled={props.area.tiled} path={props.pathToDraw} />
      </div>
    </Pixi>
  );
}

function DebugGraph(props: {
  area: AreaResource;
  visible: Accessor<VisibleGraphType>;
}) {
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
    const { tiled, graph } = props.area;

    if (props.visible() === "all") {
      for (const pos of allTileCoords()) {
        drawNode(gfx, tiled, graph, pos);
      }
    } else if (props.visible() === "tile") {
      drawNode(
        gfx,
        tiled,
        graph,
        vec_round(tiled.worldCoordToTile(engine.pointer.worldPosition)),
      );
    } else if (props.visible() === "coord") {
      const tilePos = tiled.worldCoordToTile(engine.pointer.worldPosition);
      const cleanupGraph = addVectorToAdjacentInGraph(graph, tilePos);
      drawNode(gfx, tiled, graph, tilePos, tiled.tileCoordToWorld(tilePos));
      cleanupGraph();
    }
  });

  return <Pixi label="GraphDebugUI" as={gfx} />;
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
  const world = useContext(SyncClientContext);
  const engine = useContext(EngineContext);
  const serverVersion = useServerVersion();
  const [frameInterval, setFrameInterval] = createSignal<TimeSpan>();
  const [frameDuration, setFrameDuration] = createSignal<TimeSpan>();

  onMount(() =>
    onCleanup(
      engine.addFrameCallback((interval, duration) =>
        batch(() => {
          setFrameInterval(interval);
          setFrameDuration(duration);
        }),
      ),
    ),
  );

  const text = createMemo(() => {
    const { worldPosition, position: viewportPosition } = engine.pointer;
    const tilePos = props.tiled.worldCoordToTile(worldPosition);
    return [
      `build: (client: ${env.buildVersion}, server: ${serverVersion.data})`,
      `viewport: ${vecToString(viewportPosition)}`,
      `world: ${vecToString(worldPosition)}`,
      `tile: ${vecToString(tilePos)}`,
      `tile (snapped): ${vecToString(vec_round(tilePos))}`,
      `camera transform: ${JSON.stringify(engine.camera.transform.data, null, 2)}`,
      `character: ${JSON.stringify(trimCharacterInfo(world.character()), null, 2)}`,
      `frame interval: ${frameInterval()?.totalMilliseconds.toFixed(2)}ms`,
      `frame duration: ${frameDuration()?.totalMilliseconds.toFixed(2)}ms`,
      `frame callbacks: ${engine.frameCallbackCount}`,
    ].join("\n");
  });

  return <p>{text()}</p>;
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

function drawNode(
  ctx: Graphics,
  tiled: TiledResource,
  graph: Graph,
  tilePos: Vector,
  start = tiled.tileCoordToWorld(tilePos),
) {
  for (const linkedVector of graph.getLinks(tilePos)) {
    const end = tiled.tileCoordToWorld(linkedVector);
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
      result.push(vec(x, y));
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
