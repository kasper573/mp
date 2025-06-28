import { roles, rpc, systemRoles } from "@mp/game/server";
import type { Ticker } from "@mp/time";
import { InjectionContext } from "@mp/ioc";
import { isPatchOptimizerEnabled, setPatchOptimizerEnabled } from "@mp/sync";
import { opt } from "../options";

export const systemRouter = rpc.router({
  buildVersion: rpc.procedure.output<string>().query(() => opt.buildVersion),

  testError: rpc.procedure
    .use(roles([systemRoles.useDevTools]))
    .output<string>()
    .query(() => {
      throw new Error("This is a test error that was thrown in the server");
    }),

  isPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.changeSettings]))
    .output<boolean>()
    .query(isPatchOptimizerEnabled),

  setPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.changeSettings]))
    .input<boolean>()
    .mutation(({ input }) => {
      setPatchOptimizerEnabled(input);
    }),
});

export const ctxUpdateTicker = InjectionContext.new<Ticker>("UpdateTicker");
