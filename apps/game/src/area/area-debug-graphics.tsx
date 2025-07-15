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
      () => this.settings().showWalkableScore,
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
  private cleanups: Array<() => void> = [];
  private walkableScoreText = new Text({
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
    private shouldShowWalkableScore: () => boolean,
  ) {
    super();

    this.addChild(this.gfx);
    this.walkableChecker = new WalkableChecker(area.tiled);
    this.addChild(this.walkableScoreText);

    this.cleanups = [
      effect(this.redrawGraph),
      effect(this.updateWalkableScoreText),
    ];
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
    for (const cleanup of this.cleanups) {
      cleanup();
    }
  }

  private redrawGraph = () => {
    this.gfx.clear();
    const engine = ioc.get(ctxEngine);
    const { tiled, graph } = this.area;
    const { worldPosition } = engine.pointer;

    if (this.visibleGraphType() === "all") {
      for (const node of graph.getNodes()) {
        drawGraphNode(this.gfx, tiled, graph, node);
      }
    } else if (this.visibleGraphType() === "tile") {
      const tileNode = graph.getNearestNode(
        tiled.worldCoordToTile(worldPosition.value),
      );
      if (tileNode) {
        drawGraphNode(this.gfx, tiled, graph, tileNode);
      }
    } else if (this.visibleGraphType() === "coord") {
      drawStar(
        this.gfx,
        worldPosition.value,
        graph
          .getAdjacentNodes(tiled.worldCoordToTile(worldPosition.value))
          .map((node) => tiled.tileCoordToWorld(node.data.vector)),
      );
    }
  };

  private updateWalkableScoreText = () => {
    if (!this.shouldShowWalkableScore()) {
      this.walkableScoreText.visible = false;
      return;
    }

    this.walkableScoreText.visible = true;
    const engine = ioc.get(ctxEngine);
    const { tiled } = this.area;
    const { worldPosition } = engine.pointer;
    const score = this.walkableChecker.score(
      tiled.worldCoordToTile(worldPosition.value).round(),
    );
    this.walkableScoreText.position.copyFrom(worldPosition.value);
    this.walkableScoreText.position.x += 5;
    this.walkableScoreText.text = `${(score * 100).toFixed(2)}% walkable`;
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
