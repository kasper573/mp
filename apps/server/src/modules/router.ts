import type { UrlFactory } from "@mp/data";
import { t } from "../trpc.ts";
import { createAreaRouter } from "./area/router.ts";
import type { SystemRouterDependencies } from "./system/router.ts";
import { createSystemRouter } from "./system/router.ts";
import type { CharacterRouterDependencies } from "./character/router.ts";
import { createCharacterRouter } from "./character/router.ts";
import type { NPCRouterDependencies } from "./npc/router.ts";
import { createNPCRouter } from "./npc/router.ts";

export type RootRouter = ReturnType<typeof createRootRouter>;

export interface RootRouterDependencies
  extends
    CharacterRouterDependencies,
    NPCRouterDependencies,
    SystemRouterDependencies {
  createUrl: UrlFactory;
}

export function createRootRouter({
  createUrl,
  ...dependencies
}: RootRouterDependencies) {
  return t.router({
    character: createCharacterRouter(dependencies),
    system: createSystemRouter(dependencies),
    area: createAreaRouter(createUrl),
    npc: createNPCRouter(dependencies),
  });
}
