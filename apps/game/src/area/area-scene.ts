import { VectorSpring } from "@mp/engine";
import { Vector } from "@mp/math";
import { Rect } from "@mp/math";
import { type Tile, type Pixel, dedupe, throttle } from "@mp/std";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { createTiledTextureLookup, TiledRenderer } from "@mp/tiled-renderer";
import type { ObjectId } from "@mp/tiled-loader";
import type { DestroyOptions } from "@mp/graphics";
import {
  Container,
  Matrix,
  reactiveCollectionBinding,
  RenderLayer,
  Ticker,
} from "@mp/graphics";
import { TimeSpan } from "@mp/time";
import { computed } from "@mp/state";
import { getAreaIdFromObject, type AreaResource } from "./area-resource";
import { ActorController } from "../actor/actor-controller";
import { ioc } from "../context/ioc";
import { ctxGameStateClient } from "../game-state/game-state-client";
import { ctxEngine } from "../context/common";
import { AreaDebugGraphics } from "./area-debug-graphics";
import type { AreaDebugSettings } from "./area-debug-settings-form";
import type { TileHighlightTarget } from "./tile-highlight";
import { TileHighlight } from "./tile-highlight";
import { clientViewDistance } from "../client-view-distance-settings";

export interface AreaSceneOptions {
  area: AreaResource;
  spritesheets: TiledSpritesheetRecord;
  debugSettings: () => AreaDebugSettings;
}

export class AreaScene extends Container {
  private engine = ioc.get(ctxEngine);
  private state = ioc.get(ctxGameStateClient);
  private cleanup: () => void;

  constructor(private options: AreaSceneOptions) {
    super();

    const sortingLayer = new RenderLayer({ sortableChildren: true });
    const tiledRenderer = new TiledRenderer(
      options.area.tiled.map.layers,
      sortingLayer,
      createTiledTextureLookup(options.spritesheets),
    );

    const areaDebug = new AreaDebugGraphics(
      options.area,
      this.state.actorList,
      () => this.state.character.value?.coords,
      options.debugSettings,
    );

    this.addChild(tiledRenderer);
    this.addChild(areaDebug);
    this.addChild(sortingLayer);

    if (this.engine.isInteractive) {
      const tileHighlight = new TileHighlight(() => ({
        area: options.area,
        target: this.highlightTarget.value,
      }));
      tileHighlight.zIndex = Number.MAX_SAFE_INTEGER; // Always on top
      this.addChild(tileHighlight);
      sortingLayer.attach(tileHighlight);
    }

    this.cleanup = reactiveCollectionBinding(
      this,
      this.state.actorList,
      (actor) => {
        const ac = new ActorController({ actor, tiled: options.area.tiled });
        sortingLayer.attach(ac);
        return ac;
      },
    );

    this.onRender = this.#onRender;

    this.cameraPos = new VectorSpring(
      computed(() =>
        options.area.tiled.tileCoordToWorld(
          this.state.character.value?.coords ?? Vector.zero(),
        ),
      ),
      () => ({
        stiffness: 80,
        damping: 34,
        mass: 1,
        precision: 0.1,
      }),
    );
  }

  override destroy(options?: DestroyOptions): void {
    this.cleanup();
    super.destroy(options);
  }

  cameraPos: VectorSpring<Pixel>;

  cameraZoom = computed(() =>
    createZoomLevelForViewDistance(
      this.options.area.tiled.tileSize,
      this.engine.camera.cameraSize.value,
      clientViewDistance.renderedTileCount,
    ),
  );

  pointerTile = computed(() =>
    this.options.area.tiled.worldCoordToTile(
      this.engine.pointer.worldPosition.value,
    ),
  );

  entityAtPointer = computed(() => {
    return this.state.actorList.value.find(
      (actor) =>
        actor.health > 0 &&
        actor.hitBox.offset(actor.coords).contains(this.pointerTile.value),
    );
  });

  highlightTarget = computed((): TileHighlightTarget | undefined => {
    const entity = this.entityAtPointer.value;
    if (entity) {
      return {
        type: "attack",
        rect: entity.hitBox.offset(entity.coords),
      };
    }

    const tileNode = this.options.area.graph.getNearestNode(
      this.pointerTile.value,
    );
    if (tileNode) {
      return {
        rect: Rect.fromDiameter(tileNode.data.vector, 1 as Tile),
        type: "move",
      };
    }
  });

  moveThrottled = dedupe(
    throttle(
      (to: Vector<Tile>, desiredPortalId?: ObjectId) =>
        this.state.actions.move(to, desiredPortalId),
      100,
    ),
    ([aVector, aPortalId], [bVector, bPortalId]) =>
      aVector.equals(bVector) && aPortalId === bPortalId,
  );

  #onRender = () => {
    this.cameraPos.update(TimeSpan.fromMilliseconds(Ticker.shared.elapsedMS));
    this.engine.camera.update(
      this.options.area.tiled.mapSize,
      this.cameraZoom.value,
      this.cameraPos.value.value,
    );
    this.setFromMatrix(new Matrix(...this.engine.camera.transform.value.data));

    if (this.engine.pointer.isDown.value) {
      const entity = this.entityAtPointer.value;
      if (entity) {
        void this.state.actions.attack(entity.id);
      } else {
        const tileNode = this.options.area.graph.getNearestNode(
          this.pointerTile.value,
        );
        if (tileNode) {
          const portal = this.options.area
            .hitTestObjects([this.engine.pointer.worldPosition.value])
            .find(getAreaIdFromObject);

          this.moveThrottled(tileNode.data.vector, portal?.id);
        }
      }
    }
  };
}

function createZoomLevelForViewDistance(
  tileSize: Vector<Pixel>,
  cameraSize: Vector<Pixel>,
  tileViewDistance: Tile,
): number {
  // Never show more tiles than the view distance on any axis
  const numTilesFitInCamera =
    cameraSize.x > cameraSize.y
      ? cameraSize.x / tileSize.x
      : cameraSize.y / tileSize.y;
  return numTilesFitInCamera / tileViewDistance;
}
