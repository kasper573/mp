import type { Feature } from "../feature";
import type { ClientId, EntityId, World } from "@rift/core";
import type { AreaResource } from "../area/area-resource";
import type { AreaId } from "@mp/fixtures";
import { AreaTag } from "../area/components";
import { CharacterTag } from "../identity/components";
import { Movement } from "../movement/components";
import { InventoryRef } from "../inventory/components";
import {
  scopeEntityForClient,
  type SessionRegistry,
  watchedEntityForClient,
} from "../identity/session-registry";
import { userRoles } from "@mp/keycloak";
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
  const visible = new Set<EntityId>();

  const scope = scopeEntityForClient(world, clientId);
  if (scope !== undefined) {
    visible.add(scope);
  }

  const watcherEntity = watchedEntityForClient(world, clientId);
  if (watcherEntity === undefined) {
    // Spectators without a claim need to see live characters so they can
    // pick one to spectate.
    const user = opts.registry.getUser(clientId);
    if (user?.roles.has(userRoles.spectate)) {
      for (const [id] of world.query(CharacterTag)) {
        visible.add(id);
      }
    }
    return visible;
  }

  const watcherArea = world.get(watcherEntity, AreaTag);
  const watcherMv = world.get(watcherEntity, Movement);
  if (!watcherArea || !watcherMv) {
    return visible;
  }
  const area = opts.areas.get(watcherArea.areaId);
  if (!area) {
    return visible;
  }

  const visibleRect = clientViewDistanceRect(
    watcherMv.coords,
    area.tiled.tileCount,
    opts.viewDistance.tileCount,
  );
  for (const [id, mv, entArea] of world.query(Movement, AreaTag)) {
    if (entArea.areaId !== watcherArea.areaId) {
      continue;
    }
    if (visibleRect.contains(mv.coords)) {
      visible.add(id);
    }
  }
  visible.add(watcherEntity);
  const watcherInv = world.get(watcherEntity, InventoryRef);
  if (watcherInv !== undefined) {
    for (const [id, ref] of world.query(InventoryRef)) {
      if (ref.inventoryId === watcherInv.inventoryId) {
        visible.add(id);
      }
    }
  }
  return visible;
}
