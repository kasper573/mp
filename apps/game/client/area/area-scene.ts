import { VectorSpring } from "@mp/engine";
import { Vector } from "@mp/math";
import { Rect } from "@mp/math";
import { type Tile, type Pixel, dedupe, throttle, assert } from "@mp/std";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { createTiledTextureLookup, LayerViewFactory } from "@mp/tiled-renderer";
import type { ObjectId } from "@mp/tiled-loader";
import type { DestroyOptions } from "@mp/graphics";
import {
  Container,
  Matrix,
  reactiveCollectionBinding,
  Ticker,
} from "@mp/graphics";
import { TimeSpan } from "@mp/time";
import { computed } from "@mp/state";
import {
  getAreaIdFromObject,
  type AreaResource,
} from "../../shared/area/area-resource";
import { ActorController } from "../actor/actor-controller";
import { clientViewDistance } from "../../server";

import { ioc } from "../context/ioc";
import { ctxGameStateClient } from "../game-state/game-state-client";
import { ctxEngine, ctxLogger } from "../context/common";
import { AreaDebugGraphics } from "./area-debug-graphics";
import type { AreaDebugSettings } from "./area-debug-settings-form";
import type { TileHighlightTarget } from "./tile-highlight";
import { TileHighlight } from "./tile-highlight";

export interface AreaSceneOptions {
  area: AreaResource;
  spritesheets: TiledSpritesheetRecord;
  debugSettings: () => AreaDebugSettings;
}

export class AreaScene extends Container {
  private cleanupActorControllers: () => void;

  private engine = ioc.get(ctxEngine);
  private state = ioc.get(ctxGameStateClient);

  constructor(private options: AreaSceneOptions) {
    super({ sortableChildren: true });

    const lookup = createTiledTextureLookup(options.spritesheets);
    const factory = new LayerViewFactory(lookup);
    const tileContainer = factory.createLayerContainer(
      options.area.tiled.map.layers.filter((l) => l.type !== "objectgroup"),
    );

    const dynamicLayerView = assert(
      tileContainer.getChildByLabel(options.area.dynamicLayer.name),
    );

    const areaDebug = new AreaDebugGraphics(
      options.area,
      this.state.actorList,
      () => this.state.character.value?.coords,
      options.debugSettings,
    );

    this.addChild(tileContainer);
    this.addChild(areaDebug);

    if (this.engine.isInteractive) {
      const tileHighlight = new TileHighlight(() => ({
        area: options.area,
        target: this.highlightTarget.value,
      }));
      this.addChild(tileHighlight);
    }

    this.onRender = this.#onRender;

    this.cleanupActorControllers = reactiveCollectionBinding(
      dynamicLayerView,
      this.state.actorList,
      (actor) => new ActorController({ actor, tiled: options.area.tiled }),
    );

    const logger = ioc.get(ctxLogger);

    this.cameraPos = new VectorSpring(
      computed(() => {
        const myCoords = this.state.character.value?.coords;
        if (myCoords) {
          return this.options.area.tiled.tileCoordToWorld(myCoords);
        }

        // Retaining the current position if the player coordinate is lost (ie. connection loss).
        const current = this.cameraPos as VectorSpring<Pixel> | undefined;
        if (current?.value.value) {
          logger.debug("Camera position lost, retaining last known position.");
          return current.value.value;
        }

        // Falling back to zero if initializing before a player coordinate is known.
        logger.debug("Camera position is not set, using zero vector.");
        return Vector.zero();
      }),
      () => ({
        stiffness: 80,
        damping: 34,
        mass: 1,
        precision: 0.1,
      }),
    );
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

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
    this.cleanupActorControllers();
  }

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

const cameraUnavailablePos = new Vector(-1000 as Pixel, -1000 as Pixel);
