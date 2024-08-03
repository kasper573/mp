import type { inferModuleDefinitions } from "@mp/network/server";
import type { WorldModuleDependencies } from "./world/module";
import { createWorldModule } from "./world/module";
import type { GlobalModule } from "./global";

// This file exists to compose all modules into a single record.
// It is used by the server runtime, but the types are also inferred to be used in the client.

export function createModules({
  global,
  ...dependencies
}: WorldModuleDependencies & { global: GlobalModule }) {
  const world = createWorldModule(dependencies);

  // TODO when do these unsubscribe?
  global.connect.subscribe(world.join);
  global.disconnect.subscribe(world.leave);
  global.tick.subscribe(world.tick);

  return {
    world,
  };
}

export type ServerModules = inferModuleDefinitions<
  ReturnType<typeof createModules>
>;
