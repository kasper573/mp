import type { inferModuleDefinitions } from "@mp/tse/server";
import type { WorldModuleDependencies } from "./world/module";
import { createWorldModule } from "./world/module";

export function createModules(dependencies: WorldModuleDependencies) {
  return {
    world: createWorldModule(dependencies),
  };
}

export type ServerModules = inferModuleDefinitions<
  ReturnType<typeof createModules>
>;
