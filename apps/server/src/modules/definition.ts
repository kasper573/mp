import type { inferModuleDefinitions } from "@mp/network/server";
import type { UrlFactory } from "@mp/data";
import type { WorldModuleDependencies } from "./world/module";
import { createWorldModule } from "./world/module";
import { createAreaModule } from "./area/module";
import type { SystemModuleDependencies } from "./system/module";
import { createSystemModule } from "./system/module";

// This file exists to compose all modules into a single record.
// It is used by the server runtime, but the types are also inferred to be used in the client.

export interface AllModuleDependencies
  extends WorldModuleDependencies,
    SystemModuleDependencies {
  createUrl: UrlFactory;
}

export function createModules({
  createUrl,
  ...dependencies
}: AllModuleDependencies) {
  const world = createWorldModule(dependencies);
  const area = createAreaModule(createUrl);
  const system = createSystemModule(dependencies);

  return {
    world,
    area,
    system,
  };
}

/**
 * These are the server modules exposed to the client.
 */
export type ServerModules = inferModuleDefinitions<
  ReturnType<typeof createModules>
>;
