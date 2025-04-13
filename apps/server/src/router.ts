import { rpc } from "@mp/game";
import { gameRpcSlice } from "@mp/game";
import { opt } from "./options";

export type RootRouter = typeof rootRouter;

export const rootRouter = rpc.router({
  system: rpc.router({
    buildVersion: rpc.procedure.output<string>().query(() => opt.buildVersion),
    testError: rpc.procedure.output<string>().query(() => {
      throw new Error("This is a test error that was thrown in the server");
    }),
  }),
  ...gameRpcSlice,
});
