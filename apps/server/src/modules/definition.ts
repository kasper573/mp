import type { inferModuleDefinitions } from "@mp/network/server";
import type { UrlFactory } from "@mp/state";
import type { Logger } from "@mp/logger";
import type { WorldModuleDependencies } from "./world/module";
import { createWorldModule } from "./world/module";
import { createAreaModule } from "./area/module";

// This file exists to compose all modules into a single record.
// It is used by the server runtime, but the types are also inferred to be used in the client.

export function createModules({
  createUrl,
  ...dependencies
}: WorldModuleDependencies & { createUrl: UrlFactory }) {
  const world = createWorldModule(withLogger(dependencies, "world"));
  const area = createAreaModule(createUrl);

  return {
    world,
    area,
  };
}

/**
 * These are the server modules exposed to the client.
 */
export type ServerModules = inferModuleDefinitions<
  ReturnType<typeof createModules>
>;

function withLogger<T extends { logger: Logger }>(deps: T, name: string): T {
  return {
    ...deps,
    logger: deps.logger.chain(name),
  };
}
