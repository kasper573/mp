import { defineRoles, roles, rpc } from "@mp/game/server";
import type { Ticker, TimeSpan } from "@mp/time";
import { InjectionContext } from "@mp/ioc";
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
    .query(({ ctx }) => ctx.get(ctxUpdateTicker).options.interval),

  setServerTickInterval: rpc.procedure
    .use(roles([systemRoles.admin]))
    .input<TimeSpan>()
    .mutation(({ input, ctx }) => {
      ctx.get(ctxUpdateTicker).options.interval = input;
    }),

  isPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.admin]))
    .output<boolean>()
    .query(({ ctx }) => ctx.get(ctxIsPatchOptimizerSettings).enabled),

  setPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.admin]))
    .input<boolean>()
    .mutation(({ input, ctx }) => {
      ctx.get(ctxIsPatchOptimizerSettings).enabled = input;
    }),
});

export const ctxUpdateTicker = InjectionContext.new<Ticker>("UpdateTicker");
export const ctxIsPatchOptimizerSettings = InjectionContext.new<{
  enabled: boolean;
}>("PatchOptimizerSettings");
