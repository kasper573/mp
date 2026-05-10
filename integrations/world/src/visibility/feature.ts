import type { Feature } from "../feature";
import type { ClientId, EntityId, World } from "@rift/core";
import type { AreaResource } from "../area/area-resource";
import type { AreaId } from "@mp/fixtures";
import { AreaTag } from "../area/components";
import { Movement } from "../movement/components";
import { OwnedBy } from "../inventory/components";
import {
  type SessionRegistry,
  watchedEntityForClient,
} from "../identity/session-registry";
import {
  clientViewDistanceRect,
  type ViewDistanceSettings,
} from "./view-distance";

export interface VisibilityFeatureOptions {
  readonly viewDistance: ViewDistanceSettings;
  readonly areas: ReadonlyMap<AreaId, AreaResource>;
  readonly registry: SessionRegistry;
}

export function visibilityFeature(opts: VisibilityFeatureOptions): Feature {
  return {
    server(server) {
      server.setVisibility((clientId) =>
        computeVisibility(server.world, opts, clientId),
      );
      return () => server.setVisibility(undefined);
    },
  };
}

function computeVisibility(
  world: World,
  opts: VisibilityFeatureOptions,
  clientId: ClientId,
): Iterable<EntityId> | undefined {
  const watcherEntity = watchedEntityForClient(world, opts.registry, clientId);
  if (watcherEntity === undefined) return [];

  const watcherArea = world.get(watcherEntity, AreaTag);
  const watcherMv = world.get(watcherEntity, Movement);
  if (!watcherArea || !watcherMv) return [];
  const area = opts.areas.get(watcherArea.areaId);
  if (!area) return [];

  const visibleRect = clientViewDistanceRect(
    watcherMv.coords,
    area.tiled.tileCount,
    opts.viewDistance.tileCount,
  );
  const visible = new Set<EntityId>();
  for (const [id, mv, entArea] of world.query(Movement, AreaTag)) {
    if (entArea.areaId !== watcherArea.areaId) continue;
    if (visibleRect.contains(mv.coords)) visible.add(id);
  }
  visible.add(watcherEntity);
  for (const [id, owned] of world.query(OwnedBy)) {
    if (owned.ownerId === watcherEntity) visible.add(id);
  }
  return visible;
}
