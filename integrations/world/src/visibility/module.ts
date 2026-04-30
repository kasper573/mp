import type { Cleanup } from "@rift/module";
import type { ClientId, EntityId, RiftServerEvent } from "@rift/core";
import { RiftServerModule, Tick } from "@rift/core";
import { inject } from "@rift/module";
import type { Tile } from "@mp/std";
import { ClientCharacterRegistry } from "../identity/client-character-registry";
import { AreaTag } from "../area/components";
import { Movement } from "../movement/components";
import { OwnedBy } from "../inventory/components";
import type { ViewDistanceSettings } from "./view-distance";

export interface VisibilityModuleOptions {
  readonly viewDistance: ViewDistanceSettings;
  readonly recomputeEveryNTicks?: number;
}

export class VisibilityModule extends RiftServerModule {
  @inject(ClientCharacterRegistry) accessor registry!: ClientCharacterRegistry;

  readonly #viewDistance: ViewDistanceSettings;
  readonly #recomputeEvery: number;
  #tickCounter = 0;

  constructor(opts: VisibilityModuleOptions) {
    super();
    this.#viewDistance = opts.viewDistance;
    this.#recomputeEvery = opts.recomputeEveryNTicks ?? 3;
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
    const radius = this.#viewDistance.networkFogOfWarTileCount / 2;
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
      const visible = new Set<EntityId>();
      for (const [id, mv, area] of this.server.world.query(Movement, AreaTag)) {
        if (area.areaId !== watcherArea.areaId) {
          continue;
        }
        if (withinRadius(mv.coords, watcherMv.coords, radius)) {
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

function withinRadius(
  a: { x: Tile; y: Tile },
  b: { x: Tile; y: Tile },
  radius: number,
): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.abs(dx) <= radius && Math.abs(dy) <= radius;
}

export type _AssertClientId = ClientId;
