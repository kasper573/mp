import { type Path, Vector } from "@mp/math";
import type { VectorGraphNode } from "@mp/path-finding";
import { type VectorGraph } from "@mp/path-finding";
import { Container, DestroyOptions, Graphics, Ticker } from "pixi.js";
import { createEffect, useContext } from "solid-js";
import { Pixi } from "@mp/solid-pixi";
import { Engine, EngineContext } from "@mp/engine";
import { type Tile, type Pixel } from "@mp/std";
import uniqolor from "uniqolor";
import { Select } from "@mp/ui";
import { computed, createReactiveStorage } from "@mp/state";
import { useSignalAsAtom, useStorage } from "@mp/state/solid";
import { clientViewDistance, type Actor } from "../../server";
import type { TiledResource } from "../../shared/area/tiled-resource";
import type { AreaResource } from "../../shared/area/area-resource";
import { clientViewDistanceRect } from "../../shared/client-view-distance-rect";
import { ReactiveCollection } from "../reactive-collection";

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
  const settingsStorage = createReactiveStorage<AreaDebugSettings>(
    localStorage,
    "area-debug-settings",
    {
      visibleGraphType: "none",
      showFogOfWar: false,
      showAttackRange: false,
      showAggroRange: false,
    },
  );
  const [settings, setSettings] = useStorage(settingsStorage);
  const engine = useContext(EngineContext);

  const actorsAtom = useSignalAsAtom(() => props.actors);

  const areaDebugUI = new Container();

  const debugTiled = new DebugTiledGraph(
    engine,
    () => props.area,
    () => settings().visibleGraphType,
  );

  const actorPaths = new ReactiveCollection(
    actorsAtom,
    (actor) =>
      new DebugPath(() => ({
        tiled: props.area.tiled,
        path: actor.path,
        color: uniqolor(actor.id).color,
      })),
  );

  const attackRanges = new ReactiveCollection(
    actorsAtom,
    (actor) =>
      new DebugCircle(() => ({
        tiled: props.area.tiled,
        pos: actor.coords,
        radius: actor.attackRange,
        color: uniqolor(actor.id).color,
      })),
  );

  const aggroRanges = new ReactiveCollection(
    computed(actorsAtom, (actors) =>
      actors.filter((actor) => actor.type === "npc"),
    ),
    (npc) =>
      new DebugCircle(() => ({
        tiled: props.area.tiled,
        pos: npc.coords,
        radius: npc.aggroRange,
        color: npc.color ? hexColorFromInt(npc.color) : uniqolor(npc.id).color,
      })),
  );

  const fogOfWar = new DebugNetworkFogOfWar(
    () => props.playerCoords ?? Vector.zero(),
    props.area,
  );

  areaDebugUI.addChild(actorPaths);
  areaDebugUI.addChild(debugTiled);
  areaDebugUI.addChild(attackRanges);
  areaDebugUI.addChild(aggroRanges);
  areaDebugUI.addChild(fogOfWar);

  createEffect(() => {
    attackRanges.visible = settings().showAttackRange;
    aggroRanges.visible = settings().showAggroRange;
    fogOfWar.visible = settings().showFogOfWar;
  });

  return (
    <Pixi as={areaDebugUI} label="AreaDebugUI" isRenderGroup>
      <>
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
      </>
    </Pixi>
  );
}

class DebugTiledGraph extends Graphics {
  constructor(
    private engine: Engine,
    private area: () => AreaResource,
    private visibleGraphType: () => VisibleGraphType,
  ) {
    super();
    Ticker.shared.add(this.update, this);
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
    Ticker.shared.remove(this.update, this);
  }

  update() {
    this.clear();
    const { tiled, graph } = this.area();
    const { worldPosition } = this.engine.pointer;

    if (this.visibleGraphType() === "all") {
      for (const node of graph.getNodes()) {
        drawGraphNode(this, tiled, graph, node);
      }
    } else if (this.visibleGraphType() === "tile") {
      const tileNode = graph.getNearestNode(
        tiled.worldCoordToTile(worldPosition.get()),
      );
      if (tileNode) {
        drawGraphNode(this, tiled, graph, tileNode);
      }
    } else if (this.visibleGraphType() === "coord") {
      drawStar(
        this,
        worldPosition.get(),
        graph
          .getAdjacentNodes(tiled.worldCoordToTile(worldPosition.get()))
          .map((node) => tiled.tileCoordToWorld(node.data.vector)),
      );
    }
  }
}

class DebugCircle extends Graphics {
  constructor(
    private options: () => {
      tiled: TiledResource;
      pos: Vector<Tile>;
      radius: Tile;
      color: string;
    },
  ) {
    super();
    this.alpha = 0.25;
    Ticker.shared.add(this.update, this);
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
    Ticker.shared.remove(this.update, this);
  }

  protected update = () => {
    const { pos, radius, color, tiled } = this.options();
    const worldPos = tiled.tileCoordToWorld(pos);
    const worldRadius = tiled.tileToWorldUnit(radius);
    this.clear();
    this.fillStyle = { color };
    this.circle(worldPos.x, worldPos.y, worldRadius);
    this.fill();
  };
}

class DebugPath extends Graphics {
  constructor(
    private options: () => {
      tiled: TiledResource;
      path: Path<Tile> | undefined;
      color: string;
    },
  ) {
    super();
    Ticker.shared.add(this.update, this);
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
    Ticker.shared.remove(this.update, this);
  }

  private update = () => {
    const { tiled, path, color } = this.options();
    this.clear();
    if (path?.length) {
      drawPath(this, path.map(tiled.tileCoordToWorld), color);
    }
  };
}

class DebugNetworkFogOfWar extends Graphics {
  constructor(
    private playerCoords: () => Vector<Tile>,
    private area: AreaResource,
  ) {
    super();
    Ticker.shared.add(this.update, this);
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
    Ticker.shared.remove(this.update, this);
  }

  private update = () => {
    const coords = this.playerCoords();
    this.clear();

    if (!coords) {
      return;
    }

    const { width, height, x, y } = clientViewDistanceRect(
      coords,
      this.area.tiled.tileCount,
      clientViewDistance.networkFogOfWarTileCount,
    ).scale(this.area.tiled.tileSize);

    this.rect(0, 0, width, height);
    this.fill({ color: "rgba(0, 255, 0, 0.5)" });
    this.position.set(x, y);
  };
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
