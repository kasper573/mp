import { t } from "@mp-modules/trpc";
import { areaRouter } from "@mp-modules/area";
import { characterRouter, npcRouter } from "@mp-modules/world";
import { opt } from "./options";

export type RootRouter = typeof rootRouter;

export const rootRouter = t.router({
  character: characterRouter,
  system: t.router({
    buildVersion: t.procedure.query(() => opt.buildVersion),
  }),
  area: areaRouter,
  npc: npcRouter,
});
