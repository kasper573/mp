import type { Feature } from "../feature";
import type { ClientId, EntityId, World } from "@rift/core";
import { clamp } from "@mp/math";
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
import type { ViewDistanceSettings } from "./view-distance";

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
): ReadonlySet<EntityId> | undefined {
  const visible = new Set<EntityId>();

  const scope = scopeEntityForClient(opts.registry, clientId);
  if (scope !== undefined) {
    visible.add(scope);
  }

  const watcherEntity = watchedEntityForClient(opts.registry, clientId);
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

  const view = opts.viewDistance.tileCount;
  const half = Math.floor(view / 2);
  const cx = clamp(watcherMv.coords.x, half, area.tiled.tileCount.x - half);
  const cy = clamp(watcherMv.coords.y, half, area.tiled.tileCount.y - half);
  const x0 = cx - view / 2;
  const y0 = cy - view / 2;
  const x1 = x0 + view;
  const y1 = y0 + view;
  for (const [id, mv, entArea] of world.query(Movement, AreaTag)) {
    if (entArea.areaId !== watcherArea.areaId) {
      continue;
    }
    const { x, y } = mv.coords;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
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
