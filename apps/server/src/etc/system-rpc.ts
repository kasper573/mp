import { defineRoles, roles, rpc } from "@mp/game/server";
import type { Ticker } from "@mp/time";
import { TimeSpan } from "@mp/time";
import { InjectionContext } from "@mp/ioc";
import { isPatchOptimizerEnabled, setPatchOptimizerEnabled } from "@mp/sync";
import { opt } from "../options";

export const systemRoles = defineRoles("sys", ["admin"]);

export const systemRouter = rpc.router({
  buildVersion: rpc.procedure.output<string>().query(() => opt.buildVersion),

  testError: rpc.procedure.output<string>().query(() => {
    throw new Error("This is a test error that was thrown in the server");
  }),

  serverTickInterval: rpc.procedure
    .use(roles([systemRoles.admin]))
    .output<TimeSpan>()
    .query(({ ctx }) => ctx.get(ctxUpdateTicker).interval ?? TimeSpan.Zero),

  setServerTickInterval: rpc.procedure
    .use(roles([systemRoles.admin]))
    .input<TimeSpan>()
    .mutation(({ input: newInterval, ctx }) => {
      const ticker = ctx.get(ctxUpdateTicker);
      if (ticker.isRunning) {
        ticker.stop();
        ticker.start(newInterval);
      } else {
        throw new Error("Ticker is not running, cannot change interval");
      }
    }),

  isPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.admin]))
    .output<boolean>()
    .query(isPatchOptimizerEnabled),

  setPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.admin]))
    .input<boolean>()
    .mutation(({ input }) => setPatchOptimizerEnabled(input)),
});

export const ctxUpdateTicker = InjectionContext.new<Ticker>("UpdateTicker");
