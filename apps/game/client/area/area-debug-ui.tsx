import { type Path, type Vector } from "@mp/math";
import type { VectorGraphNode } from "@mp/path-finding";
import { type VectorGraph } from "@mp/path-finding";
import { Graphics } from "pixi.js";
import type { Accessor } from "solid-js";
import { createEffect, createMemo, For, Show, useContext } from "solid-js";
import { Pixi } from "@mp/solid-pixi";
import { EngineContext } from "@mp/engine";
import { type Tile, type Pixel } from "@mp/std";
import uniqolor from "uniqolor";
import { Select } from "@mp/ui";
import { createStorageSignal } from "@mp/state";
import type { Actor } from "../../server";
import type { TiledResource } from "../../shared/area/tiled-resource";
import type { AreaResource } from "../../shared/area/area-resource";
import { clientViewDistanceRect } from "../../shared/client-view-distance-rect";

import { GameDebugUiPortal } from "../debug/game-debug-ui-state";
import { AreaSceneContext } from "./area-scene";

const visibleGraphTypes = ["none", "all", "tile", "coord"] as const;
type VisibleGraphType = (typeof visibleGraphTypes)[number];

interface AreaDebugSettings {
  visibleGraphType: VisibleGraphType;
  showFogOfWar: boolean;
}

export function AreaDebugUi(props: {
  area: AreaResource;
  drawPathsForActors: Actor[];
  playerCoords?: Vector<Tile>;
  visualizeNetworkFogOfWar?: boolean;
}) {
  const [settings, setSettings] = createStorageSignal<AreaDebugSettings>(
    localStorage,
    "area-debug-settings",
    {
      visibleGraphType: "none",
      showFogOfWar: false,
    },
  );

  return (
    <Pixi label="AreaDebugUI" isRenderGroup>
      <DebugGraph
        area={props.area}
        visible={() => settings().visibleGraphType}
      />
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
      <GameDebugUiPortal>
        <div>
          Visible Graph lines:{" "}
          <Select
            options={visibleGraphTypes}
            value={settings().visibleGraphType}
            onChange={(visibleGraphType) =>
              setSettings((prev) => ({ ...prev, visibleGraphType }))
            }
          />
        </div>
        <label>
          <input
            type="checkbox"
            checked={settings().showFogOfWar}
            on:change={(e) =>
              setSettings((prev) => ({
                ...prev,
                showFogOfWar: e.currentTarget.checked,
              }))
            }
          />
          Visualize network fog of war
        </label>
      </GameDebugUiPortal>

      <Show when={settings().showFogOfWar && props.playerCoords}>
        {(coords) => (
          <DebugNetworkFogOfWar playerCoords={coords()} area={props.area} />
        )}
      </Show>
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
