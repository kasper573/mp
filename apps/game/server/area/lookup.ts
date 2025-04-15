import { InjectionContext } from "@mp/ioc";
import type { AreaId } from "../../shared/area/area-id";
import type { AreaResource } from "../../shared/area/area-resource";

export type AreaLookup = ReadonlyMap<AreaId, AreaResource>;

export const ctxAreaLookup = InjectionContext.new<AreaLookup>();
