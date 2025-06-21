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
import { clientViewDistance, type Actor } from "../../server";
import type { TiledResource } from "../../shared/area/tiled-resource";
import type { AreaResource } from "../../shared/area/area-resource";
import { clientViewDistanceRect } from "../../shared/client-view-distance-rect";

import { GameDebugUiPortal } from "../debug/game-debug-ui-state";

const visibleGraphTypes = ["none", "all", "tile", "coord"] as const;
type VisibleGraphType = (typeof visibleGraphTypes)[number];

interface AreaDebugSettings {
  visibleGraphType: VisibleGraphType;
  showFogOfWar: boolean;
  showAttackRange: boolean;
  showAggroRange: boolean;
}

export function AreaDebugUi(props: {
  area: AreaResource;
  actors: Actor[];
  playerCoords?: Vector<Tile>;
}) {
  const [settings, setSettings] = createStorageSignal<AreaDebugSettings>(
    localStorage,
    "area-debug-settings",
    {
      visibleGraphType: "none",
      showFogOfWar: false,
      showAttackRange: false,
      showAggroRange: false,
    },
  );

  return (
    <Pixi label="AreaDebugUI" isRenderGroup>
      <DebugGraph
        area={props.area}
        visible={() => settings().visibleGraphType}
      />
      <For each={props.actors}>
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
            required
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
        <br />
        <label>
          <input
            type="checkbox"
            checked={settings().showAttackRange}
            on:change={(e) =>
              setSettings((prev) => ({
                ...prev,
                showAttackRange: e.currentTarget.checked,
              }))
            }
          />
          Show actor attack range
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={settings().showAggroRange}
            on:change={(e) =>
              setSettings((prev) => ({
                ...prev,
                showAggroRange: e.currentTarget.checked,
              }))
            }
          />
          Show npc aggro range
        </label>
      </GameDebugUiPortal>

      <Show when={settings().showFogOfWar && props.playerCoords}>
        {(coords) => (
          <DebugNetworkFogOfWar playerCoords={coords()} area={props.area} />
        )}
      </Show>
      <Show when={settings().showAttackRange}>
        <For each={props.actors}>
          {(actor) => (
            <DebugCircle
              tiled={props.area.tiled}
              pos={actor.coords}
              radius={actor.attackRange}
              color={uniqolor(actor.id).color}
            />
          )}
        </For>
      </Show>
      <Show when={settings().showAggroRange}>
        <For each={props.actors.filter((actor) => actor.type === "npc")}>
          {(npc) => (
            <DebugCircle
              tiled={props.area.tiled}
              pos={npc.coords}
              radius={npc.aggroRange}
              color={
                npc.color ? hexColorFromInt(npc.color) : uniqolor(npc.id).color
              }
            />
          )}
        </For>
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

function DebugCircle(props: {
  tiled: TiledResource;
  pos: Vector<Tile>;
  radius: Tile;
  color: string;
}) {
  const graphics = new Graphics();
  graphics.alpha = 0.25;
  createEffect(() => {
    const pos = props.tiled.tileCoordToWorld(props.pos);
    const radius = props.tiled.tileToWorldUnit(props.radius);
    graphics.clear();
    graphics.fillStyle = { color: props.color };
    graphics.circle(pos.x, pos.y, radius);
    graphics.fill();
  });
  return <Pixi as={graphics} />;
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
  const { networkFogOfWarTileCount } = clientViewDistance;

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

function hexColorFromInt(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
