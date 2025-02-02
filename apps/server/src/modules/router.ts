import type { UrlFactory } from "@mp/data";
import { t } from "../trpc";
import { createAreaRouter } from "./area/router";
import type { SystemRouterDependencies } from "./system/router";
import { createSystemRouter } from "./system/router";
import type { CharacterRouterDependencies } from "./character/router";
import { createCharacterRouter } from "./character/router";
import type { NPCRouterDependencies } from "./npc/router";
import { createNPCRouter } from "./npc/router";

export type RootRouter = ReturnType<typeof createRootRouter>;

export interface RootRouterDependencies
  extends CharacterRouterDependencies,
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
