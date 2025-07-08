import { ctxEngine } from "@mp/engine";
import { Vector } from "@mp/math";
import { Rect } from "@mp/math";
import { type Tile, type Pixel, dedupe, throttle, assert } from "@mp/std";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { createTiledTextureLookup, LayerViewFactory } from "@mp/tiled-renderer";
import type { ObjectId } from "@mp/tiled-loader";
import type { DestroyOptions } from "pixi.js";
import { Container, Matrix } from "pixi.js";
import {
  getAreaIdFromObject,
  type AreaResource,
} from "../../shared/area/area-resource";
import { ActorController } from "../actor/actor-controller";
import { clientViewDistance } from "../../server";

import { reactiveCollectionBinding } from "../pixi/reactive-collection";
import { ioc } from "../context";
import { ctxGameStateClient } from "../game-state/game-state-client";
import { AreaDebugGraphics } from "./area-debug-graphics";
import type { AreaDebugSettings } from "./area-debug-settings-form";
import type { TileHighlightTarget } from "./tile-highlight";
import { TileHighlight } from "./tile-highlight";

export class AreaScene extends Container {
  private cleanupActorControllers: () => void;

  private engine = ioc.get(ctxEngine);
  private state = ioc.get(ctxGameStateClient);

  constructor(
    private options: {
      area: AreaResource;
      spritesheets: TiledSpritesheetRecord;
      debugSettings: AreaDebugSettings;
    },
  ) {
    super({ sortableChildren: true });

    console.log("Creating AreaScene");

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
      () => this.myCoords(),
      () => options.debugSettings,
    );

    this.addChild(tileContainer);
    this.addChild(areaDebug);

    if (this.engine.isInteractive) {
      const tileHighlight = new TileHighlight(() => ({
        area: options.area,
        target: this.highlightTarget(),
      }));
      this.addChild(tileHighlight);
    }

    this.onRender = this.#onRender;

    this.cleanupActorControllers = reactiveCollectionBinding(
      dynamicLayerView,
      this.state.actorList,
      (actor) => new ActorController({ actor, tiled: options.area.tiled }),
    );
  }

  myCoords() {
    return this.state.character.$getObservableValue()?.coords ?? Vector.zero();
  }

  myWorldPos() {
    return this.options.area.tiled.tileCoordToWorld(this.myCoords());
  }

  cameraPos() {
    return this.myWorldPos();
  }

  // cameraPos = new VectorSpring<Pixel>(myWorldPosAtom, () => ({
  //   stiffness: 80,
  //   damping: 40,
  //   mass: 1,
  //   precision: 0.1,
  // }))

  cameraZoom() {
    return createZoomLevelForViewDistance(
      this.options.area.tiled.tileSize,
      this.engine.camera.cameraSize.$getObservableValue(),
      clientViewDistance.renderedTileCount,
    );
  }

  pointerTile() {
    return this.options.area.tiled.worldCoordToTile(
      this.engine.pointer.worldPosition.$getObservableValue(),
    );
  }

  entityAtPointer() {
    const tile = this.pointerTile();
    return this.state.actorList
      .$getObservableValue()
      .find(
        (actor) =>
          actor.health > 0 && actor.hitBox.offset(actor.coords).contains(tile),
      );
  }

  highlightTarget(): TileHighlightTarget | undefined {
    const entity = this.entityAtPointer();
    if (entity) {
      return {
        type: "attack",
        rect: entity.hitBox.offset(entity.coords),
      };
    }

    const tileNode = this.options.area.graph.getNearestNode(this.pointerTile());
    if (tileNode) {
      return {
        rect: Rect.fromDiameter(tileNode.data.vector, 1 as Tile),
        type: "move",
      };
    }
  }

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
    console.log("Destroying AreaScene");
    this.cleanupActorControllers();
  }

  #onRender = () => {
    this.engine.camera.update(
      this.options.area.tiled.mapSize,
      this.cameraZoom(),
      this.cameraPos(),
    );
    this.setFromMatrix(
      new Matrix(...this.engine.camera.transform.$getObservableValue().data),
    );

    if (this.engine.pointer.isDown.$getObservableValue()) {
      const entity = this.entityAtPointer();
      if (entity) {
        void this.state.actions.attack(entity.id);
      } else {
        const tileNode = this.options.area.graph.getNearestNode(
          this.pointerTile(),
        );
        if (tileNode) {
          const portal = this.options.area
            .hitTestObjects([
              this.engine.pointer.worldPosition.$getObservableValue(),
            ])
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
