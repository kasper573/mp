import { VectorSpring } from "@mp/engine";
import { Vector } from "@mp/math";
import { Rect } from "@mp/math";
import { type Tile, type Pixel, dedupe, throttle, assert } from "@mp/std";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { createTiledTextureLookup, LayerViewFactory } from "@mp/tiled-renderer";
import type { ObjectId } from "@mp/tiled-loader";
import type { DestroyOptions } from "pixi.js";
import { Container, Matrix, Ticker } from "pixi.js";
import { TimeSpan } from "@mp/time";
import {
  getAreaIdFromObject,
  type AreaResource,
} from "../../shared/area/area-resource";
import { ActorController } from "../actor/actor-controller";
import { clientViewDistance } from "../../server";

import { reactiveCollectionBinding } from "../pixi/reactive-collection";
import { ioc } from "../context";
import { ctxGameStateClient } from "../game-state/game-state-client";
import { ctxEngine } from "../engine-context";
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
      () => this.myCoords.get(),
      options.debugSettings,
    );

    this.addChild(tileContainer);
    this.addChild(areaDebug);

    if (this.engine.isInteractive) {
      const tileHighlight = new TileHighlight(() => ({
        area: options.area,
        target: this.highlightTarget.get(),
      }));
      this.addChild(tileHighlight);
    }

    this.onRender = this.#onRender;

    this.cleanupActorControllers = reactiveCollectionBinding(
      dynamicLayerView,
      this.state.actorList,
      (actor) => new ActorController({ actor, tiled: options.area.tiled }),
    );

    this.cameraPos = new VectorSpring(this.myWorldPos, () => ({
      stiffness: 80,
      damping: 40,
      mass: 1,
      precision: 0.1,
    }));
  }

  myCoords = this.state.character.derive(
    (char) => char?.coords ?? Vector.zero<Tile>(),
  );

  myWorldPos = this.myCoords.derive((coords) =>
    this.options.area.tiled.tileCoordToWorld(coords),
  );

  cameraPos: VectorSpring<Pixel>;

  cameraZoom = this.engine.camera.cameraSize.derive((size) =>
    createZoomLevelForViewDistance(
      this.options.area.tiled.tileSize,
      size,
      clientViewDistance.renderedTileCount,
    ),
  );

  pointerTile = this.engine.pointer.worldPosition.derive((pos) =>
    this.options.area.tiled.worldCoordToTile(pos),
  );

  entityAtPointer = this.pointerTile
    .compose(this.state.actorList)
    .derive(([tile, actors]) => {
      return actors.find(
        (actor) =>
          actor.health > 0 && actor.hitBox.offset(actor.coords).contains(tile),
      );
    });

  highlightTarget = this.entityAtPointer.derive(
    (entity): TileHighlightTarget | undefined => {
      if (entity) {
        return {
          type: "attack",
          rect: entity.hitBox.offset(entity.coords),
        };
      }

      const tileNode = this.options.area.graph.getNearestNode(
        this.pointerTile.get(),
      );
      if (tileNode) {
        return {
          rect: Rect.fromDiameter(tileNode.data.vector, 1 as Tile),
          type: "move",
        };
      }
    },
  );

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
      this.cameraZoom.get(),
      this.cameraPos.value.get(),
    );
    this.setFromMatrix(new Matrix(...this.engine.camera.transform.get().data));

    if (this.engine.pointer.isDown.get()) {
      const entity = this.entityAtPointer.get();
      if (entity) {
        void this.state.actions.attack(entity.id);
      } else {
        const tileNode = this.options.area.graph.getNearestNode(
          this.pointerTile.get(),
        );
        if (tileNode) {
          const portal = this.options.area
            .hitTestObjects([this.engine.pointer.worldPosition.get()])
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
