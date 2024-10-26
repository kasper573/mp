import type { UrlFactory } from "@mp/data";
import { t } from "../trpc";
import { createAreaRouter } from "./area/router";
import type { SystemRouterDependencies } from "./system/router";
import { createSystemRouter } from "./system/router";
import type { WorldRouterDependencies } from "./world/router";
import { createWorldRouter } from "./world/router";

export type RootRouter = ReturnType<typeof createRootRouter>;

export interface RootRouterDependencies
  extends WorldRouterDependencies,
    SystemRouterDependencies {
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
