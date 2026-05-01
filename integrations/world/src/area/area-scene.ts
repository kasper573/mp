import type { Engine } from "@mp/engine";
import { VectorSpring } from "@mp/engine";
import type { ViewDistanceSettings } from "../visibility/view-distance";
import type { DestroyOptions } from "@mp/graphics";
import {
  Container,
  Matrix,
  reactiveCollectionBinding,
  Ticker,
} from "@mp/graphics";
import { Rect, Vector } from "@mp/math";
import { computed, type ReadonlySignal } from "@preact/signals-core";
import { dedupe, throttle, type Pixel, type Tile } from "@mp/std";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { createTiledTextureLookup, TiledRenderer } from "@mp/tiled-renderer";
import { TimeSpan } from "@mp/time";
import type { RiftClient } from "@rift/core";
import { ActorController } from "../appearance/actor-controller";
import type { ActorTextureLookup } from "../appearance/actor-texture-lookup";
import { actorListSignal } from "../client/signals";
import type { Actor, Character } from "../client/views";
import { attackTarget, moveCharacter } from "../client/actions";
import { AreaDebugGraphics } from "./area-debug-graphics";
import type { AreaDebugSettings } from "./area-debug-settings-form";
import type { AreaResource } from "./area-resource";
import type { TileHighlightTarget } from "./tile-highlight";
import { TileHighlight } from "./tile-highlight";

export interface AreaSceneOptions {
  area: AreaResource;
  engine: Engine;
  client: RiftClient;
  character: ReadonlySignal<Character | undefined>;
  actorTextures: ActorTextureLookup;
  areaSpritesheets: TiledSpritesheetRecord;
  debugSettings: () => AreaDebugSettings;
  viewDistance: ViewDistanceSettings;
}

export class AreaScene extends Container {
  private cleanupFns: Array<() => void>;
  private actorList: ReadonlySignal<readonly Actor[]>;

  constructor(private options: AreaSceneOptions) {
    super({ sortableChildren: true });

    this.actorList = actorListSignal(options.client.world);

    const tiledRenderer = new TiledRenderer(
      options.area.tiled.map.layers,
      options.area.dynamicLayer.name,
      createTiledTextureLookup(options.areaSpritesheets),
    );

    const areaDebug = new AreaDebugGraphics(
      options.engine,
      options.area,
      this.actorList,
      () => options.character.value?.movement.coords,
      options.debugSettings,
      options.viewDistance,
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
        this.actorList,
        (actor) =>
          new ActorController({
            actor,
            client: options.client,
            actorTextures: options.actorTextures,
            tiled: options.area.tiled,
          }),
      ),
      this.options.engine.pointer.onClick(this.onPointerClick),
    ];

    this.onRender = this.#onRender;

    this.cameraPos = new VectorSpring(
      computed(() =>
        options.area.tiled.tileCoordToWorld(
          options.character.value?.movement.coords ?? Vector.zero(),
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
      this.options.viewDistance.tileCount,
    ),
  );

  pointerTile = computed(() =>
    this.options.area.tiled.worldCoordToTile(
      this.options.engine.pointer.worldPosition.value,
    ),
  );

  actorAtPointer = computed(() => {
    return this.actorList.value.find(
      (actor) =>
        actor.combat.alive &&
        actor.combat.hitBox
          .offset(actor.movement.coords)
          .contains(this.pointerTile.value),
    );
  });

  highlightTarget = computed((): TileHighlightTarget | undefined => {
    const actor = this.actorAtPointer.value;
    const ownId = this.options.character.value?.identity.id;
    if (actor && (actor.type === "npc" || actor.identity.id !== ownId)) {
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
      attackTarget(this.options.client, target.actor.entityId);
    }
  };

  moveThrottled = dedupe(
    throttle((to: Vector<Tile>) => moveCharacter(this.options.client, to), 100),
    ([aVector], [bVector]) => aVector.equals(bVector),
  );

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
        this.moveThrottled(Vector.from(target.rect));
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
  const numTilesFitInCamera =
    cameraSize.x > cameraSize.y
      ? cameraSize.x / tileSize.x
      : cameraSize.y / tileSize.y;
  return numTilesFitInCamera / tileViewDistance;
}
