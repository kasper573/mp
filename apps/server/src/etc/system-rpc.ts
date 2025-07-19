import { roles, rpc, systemRoles } from "@mp/game/server";
import { SyncEntity } from "@mp/sync";
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
    .query(() => SyncEntity.shouldOptimizeCollects),

  setPatchOptimizerEnabled: rpc.procedure
    .use(roles([systemRoles.changeSettings]))
    .input<boolean>()
    .mutation(({ input }) => {
      SyncEntity.shouldOptimizeCollects = input;
    }),
});
