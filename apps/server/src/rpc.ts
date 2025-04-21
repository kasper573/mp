import { rpc } from "@mp/game/server";
import { gameServerRpcSlice } from "@mp/game/server";
import { opt } from "./options";

export type ServerRpcRouter = typeof serverRpcRouter;

export const serverRpcRouter = rpc.router({
  system: rpc.router({
    buildVersion: rpc.procedure.output<string>().query(() => opt.buildVersion),
    testError: rpc.procedure.output<string>().query(() => {
      throw new Error("This is a test error that was thrown in the server");
    }),
  }),
  ...gameServerRpcSlice,
});
