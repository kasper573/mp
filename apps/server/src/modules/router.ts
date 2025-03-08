import { t } from "@mp-modules/trpc";
import { areaRouter } from "@mp-modules/area";
import { systemRouter } from "./system/router";
import { characterRouter } from "./character/router";
import { npcRouter } from "./npc/router";

export type RootRouter = typeof rootRouter;

export const rootRouter = t.router({
  character: characterRouter,
  system: systemRouter,
  area: areaRouter,
  npc: npcRouter,
});
