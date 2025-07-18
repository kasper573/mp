import { roles, rpc, systemRoles } from "@mp/game/server";
import { baseServerOptions } from "@mp/server-common";

export const systemRouter = rpc.router({
  buildVersion: rpc.procedure.output<string>().query(() => baseServerOptions.buildVersion),

  testError: rpc.procedure
    .use(roles([systemRoles.useDevTools]))
    .output<string>()
    .query(() => {
      throw new Error("This is a test error that was thrown in the API server");
    }),
});