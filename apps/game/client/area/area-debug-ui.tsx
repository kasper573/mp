import { type Path, type Vector } from "@mp/math";
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
  Show,
  useContext,
} from "solid-js";
import { Pixi } from "@mp/solid-pixi";
import { EngineContext } from "@mp/engine";
import type { Tile, Pixel } from "@mp/std";
import type { TimeSpan } from "@mp/time";
import { Select, Button } from "@mp/ui";
import uniqolor from "uniqolor";
import type { Actor, Character } from "../../server";
import type { TiledResource } from "../../shared/area/tiled-resource";
import { useRpc } from "../use-rpc";
import { GameStateClientContext } from "../game-state-client";
import { BuildVersionContext } from "../build-version-context";
import type { AreaResource } from "../../shared/area/area-resource";
import { clientViewDistanceRect } from "../../shared/client-view-distance-rect";
import * as styles from "./area-debug-ui.css";
import { AreaSceneContext } from "./area-scene";

const visibleGraphTypes = ["none", "all", "tile", "coord"] as const;
type VisibleGraphType = (typeof visibleGraphTypes)[number];

export function AreaDebugUi(props: {
  area: AreaResource;
  drawPathsForActors: Actor[];
  playerCoords?: Vector<Tile>;
}) {
  const [showViewbox, setShowViewbox] = createSignal(false);
  const rpc = useRpc();
  const state = useContext(GameStateClientContext);
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
        {/* Intentionally only stop propagation for the controls and not the debug info since 
        the debug info takes up so much space it would interfere with testing the game.*/}
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
            <Button on:click={() => void rpc.npc.spawnRandomNpc()}>
              Spawn random NPC
            </Button>
            <Button
              on:click={() =>
                void rpc.character.kill({ targetId: state.characterId()! })
              }
            >
              Die
            </Button>
          </div>
          <div>
            <label>
              <input
                type="checkbox"
                checked={showViewbox()}
                on:change={() => setShowViewbox(!showViewbox())}
              />
              Visualize network fog of war
            </label>
          </div>
        </div>
        <DebugInfo tiled={props.area.tiled} />
        <Show when={showViewbox() && props.playerCoords}>
          {(coords) => (
            <DebugNetworkFogOfWar playerCoords={coords()} area={props.area} />
          )}
        </Show>
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

function DebugInfo(props: { tiled: TiledResource }) {
  const versions = useContext(BuildVersionContext);
  const state = useContext(GameStateClientContext);
  const engine = useContext(EngineContext);

  const [frameInterval, setFrameInterval] = createSignal<TimeSpan>();
  const [frameDuration, setFrameDuration] = createSignal<TimeSpan>();

  onMount(() =>
    onCleanup(
      engine.addFrameCallback(({ timeSinceLastFrame, previousFrameDuration }) =>
        batch(() => {
          setFrameInterval(timeSinceLastFrame);
          setFrameDuration(previousFrameDuration);
        }),
      ),
    ),
  );

  const info = createMemo(() => {
    const { worldPosition, position: viewportPosition } = engine.pointer;
    const tilePos = props.tiled.worldCoordToTile(worldPosition);
    return {
      viewport: viewportPosition,
      world: worldPosition,
      tile: tilePos,
      tileSnapped: tilePos.round(),
      client: versions.client(),
      server: versions.server(),
      cameraTransform: engine.camera.transform.data,
      frameInterval: frameInterval(),
      frameDuration: frameDuration(),
      frameCallbacks: engine.frameCallbackCount,
      character: state.character(),
    };
  });

  return <pre class={styles.debugText}>{JSON.stringify(info(), null, 2)}</pre>;
}

function DebugNetworkFogOfWar(props: {
  playerCoords: Vector<Tile>;
  area: AreaResource;
}) {
  const { networkFogOfWarTileCount } = useContext(AreaSceneContext);

  const gfx = new Graphics();

  const rect = createMemo(() =>
    clientViewDistanceRect(
      props.playerCoords,
      props.area.tiled.tileCount,
      networkFogOfWarTileCount,
    ).scale(props.area.tiled.tileSize),
  );

  const width = createMemo(() => rect().width);
  const height = createMemo(() => rect().height);
  const x = createMemo(() => rect().x);
  const y = createMemo(() => rect().y);

  createEffect(() => {
    gfx.clear();
    gfx.rect(0, 0, width(), height());
    gfx.fill({ color: "rgba(0, 255, 0, 0.5)" });
  });

  createEffect(() => {
    gfx.position.set(x(), y());
  });

  return <Pixi label="DebugViewbox" as={gfx} />;
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
      coords: char.coords.toString(),
      path: char.path?.map((v) => v.toString()).join(" -> "),
    }
  );
}
