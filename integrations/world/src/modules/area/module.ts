import { defineModule } from "@rift/modular";
import type { AreaResource, PortalDestination } from "./area-resource";
import type { AreaId } from "../../domain-ids";

export interface AreaApi {
  registerArea(resource: AreaResource): void;
  getArea(areaId: AreaId): AreaResource | undefined;
  listAreas(): ReadonlyArray<AreaResource>;
  resolvePortal(
    areaId: AreaId,
    portalObjectId: number,
  ): PortalDestination | undefined;
}

export const AreaModule = defineModule({
  server: (): { api: AreaApi } => {
    const areas = new Map<AreaId, AreaResource>();

    const registerArea: AreaApi["registerArea"] = (resource) => {
      areas.set(resource.id, resource);
    };

    const getArea: AreaApi["getArea"] = (areaId) => areas.get(areaId);

    const listAreas: AreaApi["listAreas"] = () => [...areas.values()];

    const resolvePortal: AreaApi["resolvePortal"] = (
      areaId,
      portalObjectId,
    ) => {
      const area = areas.get(areaId);
      if (!area) return undefined;
      const portal = area.portals.find((p) => p.object.id === portalObjectId);
      return portal?.destination;
    };

    return {
      api: { registerArea, getArea, listAreas, resolvePortal },
    };
  },
  client: (): { api: Record<string, never> } => ({ api: {} }),
});
