import { defineModule } from "@rift/modular";
import type { ClientId, Entity, RiftType } from "@rift/core";
import { allComponents, Position, ItemOwner, AreaTag } from "../../components";
import { clientViewDistanceRect } from "../area/view-distance";
import type { AreaResource } from "../area/area-resource";
import { sessionModule } from "../session/module";
import { areaModule } from "../area/module";

export const visibilityModule = defineModule({
  dependencies: [areaModule, sessionModule],
  server: (ctx) => {
    const session = ctx.using(sessionModule);
    const { areas: areaMap } = ctx.using(areaModule);

    ctx.rift.setScope({
      visibleComponents(clientId: ClientId, entity: Entity): RiftType[] {
        const clientEntity = session.clientEntities.get(clientId);
        if (!clientEntity || !clientEntity.has(Position)) {
          return [];
        }

        // Client always sees itself
        if (entity === clientEntity) {
          return allComponents;
        }

        // Items owned by this client are always visible
        if (entity.has(ItemOwner)) {
          if (entity.get(ItemOwner).ownerId === clientEntity.id) {
            return allComponents;
          }
        }

        // Entities in a different area are not visible
        if (entity.has(AreaTag) && clientEntity.has(AreaTag)) {
          if (entity.get(AreaTag).areaId !== clientEntity.get(AreaTag).areaId) {
            return [];
          }
        }

        if (!entity.has(Position)) {
          return [];
        }

        const clientPos = clientEntity.get(Position);
        const entityPos = entity.get(Position);

        // Use area map size for clamping
        const areaId = session.getEntityArea(clientEntity);
        const area: AreaResource | undefined = areaMap.get(areaId);
        if (!area) {
          return [];
        }

        const viewRect = clientViewDistanceRect(
          clientPos,
          area.tiled.tileCount,
        );
        if (viewRect.contains(entityPos)) {
          return allComponents;
        }

        return [];
      },

      shouldSendEvent() {
        return true;
      },
    });

    return { api: {} };
  },
});
