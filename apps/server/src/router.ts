import { t } from "@mp-modules/trpc/server";
import {
  areaRouterSlice,
  characterRouterSlice,
  npcRouterSlice,
} from "@mp-modules/game/server";
import { opt } from "./options";

export type RootRouter = typeof rootRouter;

export const rootRouter = t.router({
  system: t.router({
    buildVersion: t.procedure.query(() => opt.buildVersion),
  }),
  ...characterRouterSlice,
  ...areaRouterSlice,
  ...npcRouterSlice,
});
