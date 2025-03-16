import { vec_round, type Path, type Vector } from "@mp/math";
import type { VectorGraphNode } from "@mp/path-finding";
import { type VectorGraph } from "@mp/path-finding";
import { Graphics } from "@mp/pixi";
import type { Accessor } from "solid-js";
import {
  batch,
  createContext,
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
import type { Tile, Pixel } from "@mp/std";
import type { TimeSpan } from "@mp/time";
import { Select, Button } from "@mp/ui";
import uniqolor from "uniqolor";
import type { Actor, Character } from "../../server";
import type { AreaResource } from "../../shared";
import type { TiledResource } from "../../shared/area/TiledResource";
import { useTRPC } from "../trpc";
import { GameStateClientContext } from "../GameStateClient";
import * as styles from "./AreaDebugUI.css";

const visibleGraphTypes = ["none", "all", "tile", "coord"] as const;
type VisibleGraphType = (typeof visibleGraphTypes)[number];

export const AreaDebugUIContext = createContext({
  serverVersion: () => "unknown" as string,
  clientVersion: () => "unknown" as string,
});

export function AreaDebugUI(props: {
  area: AreaResource;
  drawPathsForActors: Actor[];
}) {
  const trpc = useTRPC();
  const spawnNPC = trpc.npc.spawnRandomNPC.createMutation(() => ({
    meta: { invalidateCache: false },
  }));
  const [visibleGraphType, setVisibleGraphType] =
    createSignal<VisibleGraphType>("none");

  return (
    <Pixi label="AreaDebugUI" isRenderGroup>
      <DebugGraph area={props.area} visible={visibleGraphType} />
      <For each={props.drawPathsForActors}>
        {(actor) =>
          actor.path ? (
            <DebugPath
              tiled={props.area.tiled}
              path={actor.path}
              color={uniqolor(actor.id).color}
            />
          ) : null
        }
      </For>
      <div class={styles.debugMenu}>
        <div on:pointerdown={(e) => e.stopPropagation()}>
          <div>
            Visible Graph lines:{" "}
            <Select
              options={visibleGraphTypes}
              value={visibleGraphType()}
              onChange={setVisibleGraphType}
            />
          </div>
          <div>
            <Button on:click={() => spawnNPC.mutate()}>Spawn random NPC</Button>
          </div>
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

function DebugPath(props: {
  tiled: TiledResource;
  path: Path<Tile> | undefined;
  color: string;
}) {
  const gfx = new Graphics();

  createEffect(() => {
    gfx.clear();
    if (props.path?.length) {
      drawPath(gfx, props.path.map(props.tiled.tileCoordToWorld), props.color);
    }
  });

  return <Pixi label="PathDebugUI" as={gfx} />;
}

function DebugText(props: { tiled: TiledResource }) {
  const { clientVersion, serverVersion } = useContext(AreaDebugUIContext);
  const state = useContext(GameStateClientContext);
  const engine = useContext(EngineContext);

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
      `build: (client: ${clientVersion()}, server: ${serverVersion()})`,
      `viewport: ${vecToString(viewportPosition)}`,
      `world: ${vecToString(worldPosition)}`,
      `tile: ${vecToString(tilePos)}`,
      `tile (snapped): ${vecToString(vec_round(tilePos))}`,
      `camera transform: ${JSON.stringify(engine.camera.transform.data, null, 2)}`,
      `character: ${JSON.stringify(trimCharacterInfo(state.character()), null, 2)}`,
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
  graph: VectorGraph<Tile>,
  node: VectorGraphNode<Tile>,
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

function drawPath(ctx: Graphics, path: Iterable<Vector<Pixel>>, color: string) {
  const [start, ...rest] = Array.from(path);

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.strokeStyle = { width: 1, color };
  for (const { x, y } of rest) {
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawStar(
  ctx: Graphics,
  from: Vector<Pixel>,
  destinations: Iterable<Vector<Pixel>>,
) {
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

function vecToString(v: Vector<number>): string {
  return `${v.x.toFixed(1)}, ${v.y.toFixed(1)}`;
}
