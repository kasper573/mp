import { InjectionContext } from "@mp/ioc";
import type { AreaId } from "./area-id";
import type { AreaResource } from "./area-resource";

export type AreaLookup = ReadonlyMap<AreaId, AreaResource>;

export const ctxAreaLookup = InjectionContext.new<AreaLookup>("AreaLookup");
