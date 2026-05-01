import type { Cleanup } from "@rift/module";
import type { ClientId, EntityId, RiftServerEvent } from "@rift/core";
import { RiftServerModule, Tick } from "@rift/core";
import { inject } from "@rift/module";
import { ClientCharacterRegistry } from "../identity/client-character-registry";
import type { AreaResource } from "../area/area-resource";
import type { AreaId } from "../identity/ids";
import { AreaTag } from "../area/components";
import { Movement } from "../movement/components";
import { OwnedBy } from "../inventory/components";
import {
  clientViewDistanceRect,
  type ViewDistanceSettings,
} from "./view-distance";

export interface VisibilityModuleOptions {
  readonly viewDistance: ViewDistanceSettings;
  readonly areas: ReadonlyMap<AreaId, AreaResource>;
  readonly recomputeEveryNTicks?: number;
}

export class VisibilityModule extends RiftServerModule {
  @inject(ClientCharacterRegistry) accessor registry!: ClientCharacterRegistry;

  readonly #viewDistance: ViewDistanceSettings;
  readonly #areas: ReadonlyMap<AreaId, AreaResource>;
  readonly #recomputeEvery: number;
  #tickCounter = 0;

  constructor(opts: VisibilityModuleOptions) {
    super();
    this.#viewDistance = opts.viewDistance;
    this.#areas = opts.areas;
    this.#recomputeEvery = opts.recomputeEveryNTicks ?? 1;
  }

  init(): Cleanup {
    const offTick = this.server.on(Tick, this.#onTick);
    return offTick;
  }

  #onTick = (_event: RiftServerEvent<{ tick: number; dt: number }>): void => {
    this.#tickCounter++;
    if (this.#tickCounter < this.#recomputeEvery) {
      return;
    }
    this.#tickCounter = 0;
    this.#recompute();
  };

  #recompute(): void {
    for (const clientId of this.registry.clientIds()) {
      const watcherEntity = this.registry.getCharacterEntity(clientId);
      if (watcherEntity === undefined) {
        this.server.setClientVisibilityPredicate(clientId, undefined);
        continue;
      }
      const watcherArea = this.server.world.get(watcherEntity, AreaTag);
      const watcherMv = this.server.world.get(watcherEntity, Movement);
      if (!watcherArea || !watcherMv) {
        continue;
      }
      const area = this.#areas.get(watcherArea.areaId);
      if (!area) {
        continue;
      }
      const visibleRect = clientViewDistanceRect(
        watcherMv.coords,
        area.tiled.tileCount,
        this.#viewDistance.tileCount,
      );
      const visible = new Set<EntityId>();
      for (const [id, mv, entArea] of this.server.world.query(
        Movement,
        AreaTag,
      )) {
        if (entArea.areaId !== watcherArea.areaId) {
          continue;
        }
        if (visibleRect.contains(mv.coords)) {
          visible.add(id);
        }
      }
      visible.add(watcherEntity);
      for (const [id, owned] of this.server.world.query(OwnedBy)) {
        if (owned.ownerId === watcherEntity) {
          visible.add(id);
        }
      }
      this.server.setClientVisibilityPredicate(clientId, (id) =>
        visible.has(id),
      );
    }
  }
}

export type _AssertClientId = ClientId;
