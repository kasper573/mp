import { roles, rpc, systemRoles } from "@mp/game/server";
import type { Ticker } from "@mp/time";
import { InjectionContext } from "@mp/ioc";
import { SyncEntity } from "@mp/sync";
import { areaServerOptions } from "@mp/server-common";

export const systemRouter = rpc.router({
  buildVersion: rpc.procedure.output<string>().query(() => areaServerOptions.buildVersion),

  testError: rpc.procedure
    .use(roles([systemRoles.useDevTools]))
    .output<string>()
    .query(() => {
      throw new Error("This is a test error that was thrown in the area server");
    }),

  isPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.changeSettings]))
    .output<boolean>()
    .query(() => SyncEntity.shouldOptimizeCollects),

  setPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.changeSettings]))
    .input<boolean>()
    .mutation(({ input }) => {
      SyncEntity.shouldOptimizeCollects = input;
    }),

  getHandledAreas: rpc.procedure
    .output<string[]>()
    .query(() => areaServerOptions.areaIds),
});

export const ctxUpdateTicker = InjectionContext.new<Ticker>("UpdateTicker");