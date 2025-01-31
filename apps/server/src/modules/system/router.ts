import type { Ticker } from "@mp/time";
import { schemaFor, t } from "../../trpc";
import { auth } from "../../middlewares/auth";

export interface SystemRouterDependencies {
  buildVersion: string;
  updateTicker: Ticker;
}

export type SystemRouter = ReturnType<typeof createSystemRouter>;
export function createSystemRouter({
  buildVersion,
  updateTicker,
}: SystemRouterDependencies) {
  return t.router({
    buildVersion: t.procedure.query(() => buildVersion),
    isTickEnabled: t.procedure.query(() => updateTicker.isEnabled),
    setTickEnabled: t.procedure
      .use(auth())
      .input(schemaFor<boolean>())
      .mutation(({ input: enabled }) => {
        if (enabled !== updateTicker.isEnabled) {
          if (enabled) {
            updateTicker.start();
          } else {
            updateTicker.stop();
          }
        }
      }),
  });
}
