import type { AreaResource, TiledResource } from "@mp/data";
import { vec_round, type Path, type Vector } from "@mp/math";
import type { VectorGraphNode } from "@mp/path-finding";
import { type VectorGraph } from "@mp/path-finding";
import { Graphics } from "@mp/pixi";
import type { Accessor } from "solid-js";
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  For,
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
  pathsToDraw: Path[];
}) {
  const [visibleGraphType, setVisibleGraphType] =
    createSignal<VisibleGraphType>("none");

  return (
    <Pixi label="AreaDebugUI" isRenderGroup>
      <DebugGraph area={props.area} visible={visibleGraphType} />
      <For each={props.pathsToDraw}>
        {(path) => <DebugPath tiled={props.area.tiled} path={path} />}
      </For>
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
        <DebugText tiled={props.area.tiled} />
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

  createEffect(() => {
    gfx.clear();
    const { tiled, graph } = props.area;

    if (props.visible() === "all") {
      for (const node of graph.getNodes()) {
        drawGraphNode(gfx, tiled, graph, node);
      }
    } else if (props.visible() === "tile") {
      const tileNode = graph.getNearestNode(
        tiled.worldCoordToTile(engine.pointer.worldPosition),
      );
      if (tileNode) {
        drawGraphNode(gfx, tiled, graph, tileNode);
      }
    } else if (props.visible() === "coord") {
      drawStar(
        gfx,
        engine.pointer.worldPosition,
        props.area.graph
          .getAdjacentNodes(
            tiled.worldCoordToTile(engine.pointer.worldPosition),
          )
          .map((node) => tiled.tileCoordToWorld(node.data.vector)),
      );
    }
  });

  return <Pixi label="GraphDebugUI" as={gfx} />;
}

function DebugPath(props: { tiled: TiledResource; path: Path | undefined }) {
  const gfx = new Graphics();

  createEffect(() => {
    gfx.clear();
    if (props.path?.length) {
      drawPath(gfx, props.path.map(props.tiled.tileCoordToWorld));
    }
  });

  return <Pixi label="PathDebugUI" as={gfx} />;
}

function DebugText(props: { tiled: TiledResource }) {
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

function drawGraphNode(
  ctx: Graphics,
  tiled: TiledResource,
  graph: VectorGraph,
  node: VectorGraphNode,
) {
  drawStar(
    ctx,
    tiled.tileCoordToWorld(node.data.vector),
    node.links
      .values()
      .map((link) => graph.getNode(link.toId).data.vector)
      .map(tiled.tileCoordToWorld),
  );
}

function drawPath(ctx: Graphics, path: Iterable<Vector>) {
  const [start, ...rest] = Array.from(path);

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.strokeStyle = { width: 1, color: "purple" };
  for (const { x, y } of rest) {
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawStar(ctx: Graphics, from: Vector, destinations: Iterable<Vector>) {
  for (const end of destinations) {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = { width: 2, color: "red" };
    ctx.stroke();
    ctx.strokeStyle = { width: 1, color: "black" };
  }
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
