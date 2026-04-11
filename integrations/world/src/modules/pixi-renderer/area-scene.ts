import type { Engine } from "@mp/engine";
import { VectorSpring } from "@mp/engine";
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
import type { Entity, Infer, RiftClient, RiftType } from "@rift/core";
import { Appearance, Health, Position } from "../../components";
import { getDestinationFromObject, type AreaResource } from "../../area";
import { AttackIntent, MoveIntent } from "../../events";
import { ActorController } from "./actor-controller";
import { TileHighlight, type TileHighlightTarget } from "./tile-highlight";

export type SendFn = <T extends RiftType>(type: T, value: Infer<T>) => void;

export interface AreaSceneOptions {
  area: AreaResource;
  engine: Engine;
  rift: RiftClient;
  send: SendFn;
  areaSpritesheets: TiledSpritesheetRecord;
  localCharacterEntityId?: number;
  renderedTileCount: Tile;
}

export class AreaScene extends Container {
  private cleanupFns: Array<() => void>;
  private actorQuery;

  constructor(private options: AreaSceneOptions) {
    super({ sortableChildren: true });

    const tiledRenderer = new TiledRenderer(
      options.area.tiled.map.layers,
      options.area.dynamicLayer.name,
      createTiledTextureLookup(options.areaSpritesheets),
    );

    this.addChild(tiledRenderer);

    this.actorQuery = options.rift.query(Position, Appearance);

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
        this.actorQuery,
        (entity: Entity) =>
          new ActorController({ entity, tiled: options.area.tiled }),
      ),
      this.options.engine.pointer.onClick(this.onPointerClick),
    ];

    this.onRender = this.#onRender;

    this.cameraPos = new VectorSpring(
      computed(() => {
        const local = this.localCharacterEntity();
        const tile = local?.has(Position)
          ? (local.get(Position) as Vector<Tile>)
          : Vector.zero<Tile>();
        return options.area.tiled.tileCoordToWorld(tile);
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
      this.options.renderedTileCount,
    ),
  );

  pointerTile = computed(() =>
    this.options.area.tiled.worldCoordToTile(
      this.options.engine.pointer.worldPosition.value,
    ),
  );

  private localCharacterEntity(): Entity | undefined {
    const id = this.options.localCharacterEntityId;
    return id === undefined ? undefined : this.options.rift.entity(id);
  }

  private actorAtPointer = computed(() => {
    const pointer = this.pointerTile.value;
    return this.actorQuery.value.find((entity) => {
      if (entity.has(Health)) {
        const hp = entity.get(Health);
        if (hp.current <= 0) return false;
      }
      const pos = entity.get(Position);
      const rect = Rect.fromDiameter(
        new Vector(pos.x as Tile, pos.y as Tile),
        1 as Tile,
      );
      return rect.contains(pointer);
    });
  });

  highlightTarget = computed((): TileHighlightTarget | undefined => {
    const actor = this.actorAtPointer.value;
    const localId = this.options.localCharacterEntityId;
    if (actor && actor.id !== localId) {
      const pos = actor.get(Position);
      return {
        type: "attack",
        rect: Rect.fromDiameter(
          new Vector(pos.x as Tile, pos.y as Tile),
          1 as Tile,
        ),
        entityId: actor.id,
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
      this.options.send(AttackIntent, { targetEntityId: target.entityId });
    }
  };

  private moveThrottled = dedupe(
    throttle(
      (to: Vector<Tile>, desiredPortalId: ObjectId | 0) =>
        this.options.send(MoveIntent, {
          x: to.x,
          y: to.y,
          portalId: desiredPortalId as ObjectId,
        }),
      100,
    ),
    ([aVector, aPortalId], [bVector, bPortalId]) =>
      aVector.equals(bVector) && aPortalId === bPortalId,
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
        const portal = this.options.area
          .hitTestObjects(this.options.engine.pointer.worldPosition.value)
          .find((obj) => getDestinationFromObject(obj));
        this.moveThrottled(Vector.from(target.rect), portal?.id ?? 0);
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
