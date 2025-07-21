import { rpc } from "./etc/rpc-builder";
import { systemRouter } from "./etc/system-rpc";

export type ServerRpcRouter = typeof serverRpcRouter;
export const serverRpcRouter = rpc.router({
  system: systemRouter,
});
