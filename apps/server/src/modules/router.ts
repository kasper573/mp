import type { UrlFactory } from "@mp/data";
import { t } from "../trpc.ts";
import { createAreaRouter } from "./area/router.ts";
import type { SystemRouterDependencies } from "./system/router.ts";
import { createSystemRouter } from "./system/router.ts";
import type { WorldRouterDependencies } from "./world/router.ts";
import { createWorldRouter } from "./world/router.ts";

export type RootRouter = ReturnType<typeof createRootRouter>;

export interface RootRouterDependencies
  extends WorldRouterDependencies, SystemRouterDependencies {
  createUrl: UrlFactory;
}

export function createRootRouter({
  createUrl,
  ...dependencies
}: RootRouterDependencies) {
  return t.router({
    world: createWorldRouter(dependencies),
    system: createSystemRouter(dependencies),
    area: createAreaRouter(createUrl),
  });
}
