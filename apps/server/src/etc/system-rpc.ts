import { defineRoles, roles, rpc } from "@mp/game/server";
import type { Ticker } from "@mp/time";
import { InjectionContext } from "@mp/ioc";
import { PatchCollectorFactory } from "@mp/sync";
import { opt } from "../options";

export const systemRoles = defineRoles("sys", ["admin"]);

export const systemRouter = rpc.router({
  buildVersion: rpc.procedure.output<string>().query(() => opt.buildVersion),

  testError: rpc.procedure.output<string>().query(() => {
    throw new Error("This is a test error that was thrown in the server");
  }),

  isPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.admin]))
    .output<boolean>()
    .query(() => PatchCollectorFactory.optimize),

  setPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.admin]))
    .input<boolean>()
    .mutation(({ input }) => {
      PatchCollectorFactory.optimize = input;
    }),
});

export const ctxUpdateTicker = InjectionContext.new<Ticker>("UpdateTicker");
