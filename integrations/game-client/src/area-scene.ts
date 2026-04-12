import type { Engine } from "@mp/engine";
import { VectorSpring } from "@mp/engine";
import { clientViewDistance } from "@mp/fixtures";
import type { AreaResource } from "@mp/world";
import { Position, Combat } from "@mp/world";
import type { DestroyOptions } from "@mp/graphics";
import {
  Container,
  Matrix,
  reactiveCollectionBinding,
  Ticker,
} from "@mp/graphics";
import { Rect, Vector } from "@mp/math";
import { computed } from "@mp/state";
import type { Pixel, Tile } from "@mp/std";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { createTiledTextureLookup, TiledRenderer } from "@mp/tiled-renderer";
import { TimeSpan } from "@mp/time";
import { ActorController } from "./actor-controller";
import type { ActorTextureLookup } from "./actor-texture-lookup";
import { AreaDebugGraphics } from "./area-debug-graphics";
import type { AreaDebugSettings } from "./area-debug-settings-form";
import type { GameStateClient } from "./game-state-client";
import type { TileHighlightTarget } from "./tile-highlight";
import { TileHighlight } from "./tile-highlight";

export interface AreaSceneOptions {
  area: AreaResource;
  engine: Engine;
  state: GameStateClient;
  actorTextures: ActorTextureLookup;
  areaSpritesheets: TiledSpritesheetRecord;
  debugSettings: () => AreaDebugSettings;
}

export class AreaScene extends Container {
  private cleanupFns: Array<() => void>;

  constructor(private options: AreaSceneOptions) {
    super({ sortableChildren: true });

    const tiledRenderer = new TiledRenderer(
      options.area.tiled.map.layers,
      options.area.dynamicLayer.name,
      createTiledTextureLookup(options.areaSpritesheets),
    );

    const areaDebug = new AreaDebugGraphics(
      options.engine,
      options.area,
      options.state.actors,
      () => {
        const entity = options.state.myEntity.value;
        return entity ? entity.get(Position) : undefined;
      },
      options.debugSettings,
    );

    this.addChild(tiledRenderer);
    this.addChild(areaDebug);

    if (options.engine.isInteractive) {
      const tileHighlight = new TileHighlight(() => ({
        area: options.area,
        target: this.highlightTarget.value,
      }));
      this.addChild(tileHighlight);
    }

    this.cleanupFns = [
      reactiveCollectionBinding(
        tiledRenderer.dynamicLayer,
        options.state.actors,
        (entity) =>
          new ActorController({
            entity,
            rift: options.state.rift,
            actorTextures: options.actorTextures,
            tiled: options.area.tiled,
          }),
      ),
      this.options.engine.pointer.onClick(this.onPointerClick),
    ];

    this.onRender = this.#onRender;

    this.cameraPos = new VectorSpring(
      computed(() => {
        const entity = options.state.myEntity.value;
        return options.area.tiled.tileCoordToWorld(
          entity ? entity.get(Position) : Vector.zero(),
        );
      }),
      () => ({
        stiffness: 80,
        damping: 34,
        mass: 1,
        precision: 0.1,
      }),
    );
  }

  override destroy(options?: DestroyOptions): void {
    for (const cleanup of this.cleanupFns) {
      cleanup();
    }
    super.destroy(options);
  }

  cameraPos: VectorSpring<Pixel>;

  cameraZoom = computed(() =>
    createZoomLevelForViewDistance(
      this.options.area.tiled.tileSize,
      this.options.engine.camera.cameraSize.value,
      clientViewDistance.renderedTileCount,
    ),
  );

  pointerTile = computed(() =>
    this.options.area.tiled.worldCoordToTile(
      this.options.engine.pointer.worldPosition.value,
    ),
  );

  actorAtPointer = computed(() => {
    return this.options.state.actors.value.find((entity) => {
      const combat = entity.get(Combat);
      if (combat.health <= 0) return false;
      const coords = entity.get(Position);
      return Rect.fromDiameter(coords, 1 as Tile).contains(
        this.pointerTile.value,
      );
    });
  });

  highlightTarget = computed((): TileHighlightTarget | undefined => {
    const entity = this.actorAtPointer.value;
    if (entity && entity.id !== this.options.state.myEntityId.value) {
      const coords = entity.get(Position);
      return {
        type: "attack",
        rect: Rect.fromDiameter(coords, 1 as Tile),
      };
    }

    const tileNode = this.options.area.graph.getNodeAt(this.pointerTile.value);
    if (tileNode) {
      return {
        rect: Rect.fromDiameter(tileNode.data.vector, 1 as Tile),
        type: "move",
      };
    }
  });

  private onPointerClick = () => {
    const target = this.highlightTarget.value;
    if (target?.type === "attack") {
      const entity = this.actorAtPointer.value;
      if (entity) {
        this.options.state.attack(entity.id);
      }
    }
  };

  #onRender = () => {
    this.cameraPos.update(TimeSpan.fromMilliseconds(Ticker.shared.deltaMS));
    this.options.engine.camera.update(
      this.options.area.tiled.mapSize,
      this.cameraZoom.value,
      this.cameraPos.value.value,
    );
    this.setFromMatrix(
      new Matrix(...this.options.engine.camera.transform.value.data),
    );

    if (this.options.engine.pointer.isDown.value) {
      const target = this.highlightTarget.value;
      if (target?.type === "move") {
        this.options.state.move(Vector.from(target.rect));
      }
    } else {
      this.options.state.move.clear();
    }
  };
}

function createZoomLevelForViewDistance(
  tileSize: Vector<Pixel>,
  cameraSize: Vector<Pixel>,
  tileViewDistance: Tile,
): number {
  const numTilesFitInCamera =
    cameraSize.x > cameraSize.y
      ? cameraSize.x / tileSize.x
      : cameraSize.y / tileSize.y;
  return numTilesFitInCamera / tileViewDistance;
}
