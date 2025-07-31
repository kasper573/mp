import type { Engine } from "@mp/engine";
import { VectorSpring } from "@mp/engine";
import {
  clientViewDistance,
  getAreaIdFromObject,
  type AreaResource,
} from "@mp/game-shared";
import type { DestroyOptions } from "@mp/graphics";
import {
  Container,
  Matrix,
  reactiveCollectionBinding,
  Ticker,
} from "@mp/graphics";
import { Rect, Vector } from "@mp/math";
import { computed } from "@mp/state";
import { dedupe, throttle, type Pixel, type Tile } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { createTiledTextureLookup, TiledRenderer } from "@mp/tiled-renderer";
import { TimeSpan } from "@mp/time";
import { ActorController } from "./actor-controller";
import type { ActorSpritesheetLookup } from "./actor-spritesheet-lookup";
import { AreaDebugGraphics } from "./area-debug-graphics";
import type { AreaDebugSettings } from "./area-debug-settings-form";
import type { GameStateClient } from "./game-state-client";
import type { TileHighlightTarget } from "./tile-highlight";
import { TileHighlight } from "./tile-highlight";

export interface AreaSceneOptions {
  area: AreaResource;
  engine: Engine;
  state: GameStateClient;
  actorSpritesheets: ActorSpritesheetLookup;
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
      options.state.actorList,
      () => options.state.character.value?.movement.coords,
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
        options.state.actorList,
        (actor) =>
          new ActorController({
            actor,
            eventBus: options.state.eventBus,
            actorSpritesheets: options.actorSpritesheets,
            tiled: options.area.tiled,
          }),
      ),
      this.options.engine.pointer.onClick(this.onPointerClick),
    ];

    this.onRender = this.#onRender;

    this.cameraPos = new VectorSpring(
      computed(() =>
        options.area.tiled.tileCoordToWorld(
          options.state.character.value?.movement.coords ?? Vector.zero(),
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
    return this.options.state.actorList.value.find(
      (actor) =>
        actor.combat.health > 0 &&
        actor.combat.hitBox
          .offset(actor.movement.coords)
          .contains(this.pointerTile.value),
    );
  });

  highlightTarget = computed((): TileHighlightTarget | undefined => {
    const actor = this.actorAtPointer.value;
    if (actor && actor?.identity.id !== this.options.state.characterId.value) {
      return {
        actor,
        type: "attack",
        rect: actor.combat.hitBox.offset(actor.movement.coords),
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
      void this.options.state.actions.attack(target.actor.identity.id);
    }
  };

  moveThrottled = dedupe(
    throttle(
      (to: Vector<Tile>, desiredPortalId?: ObjectId) =>
        this.options.state.actions.move(to, desiredPortalId),
      100,
    ),
    ([aVector, aPortalId], [bVector, bPortalId]) =>
      aVector.equals(bVector) && aPortalId === bPortalId,
  );

  #onRender = () => {
    this.cameraPos.update(TimeSpan.fromMilliseconds(Ticker.shared.elapsedMS));
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
        const portal = this.options.area
          .hitTestObjects(this.options.engine.pointer.worldPosition.value)
          .find(getAreaIdFromObject);

        this.moveThrottled(Vector.from(target.rect), portal?.id);
      }
    } else {
      this.moveThrottled.clear();
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
