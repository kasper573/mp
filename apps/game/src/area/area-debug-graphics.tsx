import type { Rect } from "@mp/math";
import { type Path, Vector } from "@mp/math";
import type { VectorGraphNode } from "@mp/path-finding";
import type { VectorGraph } from "@mp/path-finding";
import type { DestroyOptions, StrokeStyle, TextStyle } from "@mp/graphics";
import { Container, Graphics, ReactiveCollection, Text } from "@mp/graphics";
import type { Tile, Pixel } from "@mp/std";
import uniqolor from "uniqolor";
import { computed, effect, type ReadonlySignal } from "@mp/state";
import type { TiledResource } from "./tiled-resource";
import type { AreaResource } from "./area-resource";
import { clientViewDistanceRect } from "../client-view-distance-rect";
import { ioc } from "../context/ioc";
import { ctxEngine } from "../context/common";
import type {
  AreaDebugSettings,
  VisibleGraphType,
} from "./area-debug-settings-form";
import { clientViewDistance } from "../client-view-distance-settings";
import type { Actor } from "../actor/actor";
import type { NpcInstance } from "../npc/types";
import { WalkableChecker } from "./tiled-walkable-checker";

export class AreaDebugGraphics extends Container {
  private actorPaths: ReactiveCollection<DebugPath>;
  private attackRanges: ReactiveCollection<Actor>;
  private aggroRanges: ReactiveCollection<NpcInstance>;
  private fogOfWar: DebugNetworkFogOfWar;

  constructor(
    area: AreaResource,
    actors: ReadonlySignal<Actor[]>,
    playerCoords: () => Vector<Tile> | undefined,
    private settings: () => AreaDebugSettings,
  ) {
    super();

    const debugTiled = new DebugTiledGraph(
      area,
      () => this.settings().visibleGraphType,
    );

    this.actorPaths = new ReactiveCollection(
      actors,
      (actor) =>
        new DebugPath(() => ({
          tiled: area.tiled,
          path: actor.path,
          color: uniqolor(actor.id).color,
        })),
    );

    this.attackRanges = new ReactiveCollection(
      actors,
      (actor) =>
        new DebugCircle(() => ({
          tiled: area.tiled,
          pos: actor.coords,
          radius: actor.attackRange,
          color: uniqolor(actor.id).color,
        })),
    );

    this.aggroRanges = new ReactiveCollection(
      computed(() => actors.value.filter((actor) => actor.type === "npc")),
      (npc) =>
        new DebugCircle(() => ({
          tiled: area.tiled,
          pos: npc.coords,
          radius: npc.aggroRange,
          color: npc.color
            ? hexColorFromInt(npc.color)
            : uniqolor(npc.id).color,
        })),
    );

    this.fogOfWar = new DebugNetworkFogOfWar(
      () => playerCoords() ?? Vector.zero(),
      () => area.tiled,
    );

    this.addChild(this.actorPaths);
    this.addChild(debugTiled);
    this.addChild(this.attackRanges);
    this.addChild(this.aggroRanges);
    this.addChild(this.fogOfWar);

    this.onRender = this.#onRender;
  }

  #onRender = () => {
    this.actorPaths.visible = this.settings().showActorPaths;
    this.attackRanges.visible = this.settings().showAttackRange;
    this.aggroRanges.visible = this.settings().showAggroRange;
    this.fogOfWar.visible = this.settings().showFogOfWar;
  };
}

class DebugTiledGraph extends Container {
  private gfx = new Graphics();
  private cleanup: () => void;
  private text = new Text({
    style: {
      fill: "white",
      fontSize: 28,
      fontWeight: "bold",
      stroke: { color: "black", width: 4 } satisfies Partial<StrokeStyle>,
    } satisfies Partial<TextStyle>,
    scale: 0.25,
  });
  private walkableChecker: WalkableChecker;

  constructor(
    private area: AreaResource,
    private visibleGraphType: () => VisibleGraphType,
  ) {
    super();

    this.addChild(this.gfx);
    this.walkableChecker = new WalkableChecker(area.tiled);
    this.addChild(this.text);

    this.cleanup = effect(this.redrawGraph);
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
    this.cleanup();
  }

  private redrawGraph = () => {
    this.gfx.clear();
    const engine = ioc.get(ctxEngine);
    const { tiled, graph } = this.area;
    const { worldPosition } = engine.pointer;
    this.text.visible = false;

    switch (this.visibleGraphType()) {
      case "all":
        for (const nodeId of graph.nodeIds) {
          const node = graph.getNode(nodeId);
          if (node) {
            drawGraphNode(this.gfx, tiled, graph, node);
          }
        }
        break;
      case "tile": {
        const tileNode = graph.getProximityNode(
          tiled.worldCoordToTile(worldPosition.value),
        );
        if (tileNode) {
          drawGraphNode(this.gfx, tiled, graph, tileNode);
        }
        break;
      }
      case "proximityNode": {
        const nearest = graph.getProximityNode(
          tiled.worldCoordToTile(worldPosition.value),
        );
        if (nearest) {
          drawManyLinesFromSameStart(this.gfx, worldPosition.value, [
            tiled.tileCoordToWorld(nearest.data.vector),
          ]);
        }
        break;
      }
      case "obscured": {
        for (const rect of this.walkableChecker.obscuringRects) {
          drawRect(
            this.gfx,
            rect.scale(tiled.tileSize),
            "rgba(255, 0, 0, 0.5)",
          );
        }

        const obscureAmount = this.walkableChecker.obscureAmount(
          tiled.worldCoordToTile(worldPosition.value).round(),
        );

        this.text.visible = true;
        this.text.position.copyFrom(worldPosition.value);
        this.text.position.x += 5;
        this.text.text = `${(obscureAmount * 100).toFixed(2)}% obscured`;
      }
    }
  };
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
    this.onRender = this.#onRender;
  }

  #onRender = () => {
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
    this.onRender = this.#onRender;
  }

  #onRender = () => {
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
    private tiled: () => TiledResource,
  ) {
    super();
    this.onRender = this.#onRender;
  }

  #onRender = () => {
    this.clear();
    const coords = this.playerCoords();
    const { tileCount, tileSize } = this.tiled();
    const { width, height, x, y } = clientViewDistanceRect(
      coords,
      tileCount,
      clientViewDistance.networkFogOfWarTileCount,
    ).scale(tileSize);

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
  drawManyLinesFromSameStart(
    ctx,
    tiled.tileCoordToWorld(node.data.vector),
    node.links
      .values()
      .map((link) => graph.getNode(link.toId)?.data.vector)
      .filter((v) => v !== undefined)
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

function drawManyLinesFromSameStart(
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

function drawRect(ctx: Graphics, rect: Rect<Pixel>, color: string) {
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.fill({ color });
}

function hexColorFromInt(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
