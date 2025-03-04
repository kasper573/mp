import { t } from "@mp-modules/trpc";
import { opt } from "../../options";

export type SystemRouter = typeof systemRouter;
export const systemRouter = t.router({
  buildVersion: t.procedure.query(() => opt.buildVersion),
});
