import { defineModule } from "@rift/modular";
import type { ClientId, Entity, RiftType } from "@rift/core";
import { allComponents, Position } from "../components";
import { clientViewDistanceRect } from "../view-distance";
import type { AreaResource } from "../area-resource";
import { sessionModule } from "./session";
import { areaModule } from "./area";

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
