import type { Ticker } from "@mp/time";
import { schemaFor, t } from "../../trpc.ts";
import { roles } from "../../middlewares/auth.ts";

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
      .use(roles(["toggle_server_tick"]))
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
