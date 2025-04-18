import { RpcBuilder } from "@mp/rpc";

const rpc = new RpcBuilder().build();

export const clientRpcRouter = rpc.router({
  greeting: rpc.procedure
    .input<{ name: string }>()
    .output<string>()
    .query(({ input }) => {
      return "Hello " + input.name;
    }),
});

export type ClientRpcRouter = typeof clientRpcRouter;
