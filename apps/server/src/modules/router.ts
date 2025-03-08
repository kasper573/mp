import { t } from "@mp-modules/trpc";
import { areaRouter } from "@mp-modules/area";
import { opt } from "../options";
import { characterRouter } from "./character/router";
import { npcRouter } from "./npc/router";

export type RootRouter = typeof rootRouter;

export const rootRouter = t.router({
  character: characterRouter,
  system: t.router({
    buildVersion: t.procedure.query(() => opt.buildVersion),
  }),
  area: areaRouter,
  npc: npcRouter,
});
