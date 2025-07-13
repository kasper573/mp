import { rpc } from "@mp/game";
import { gameServerRpcSlice } from "@mp/game";
import { systemRouter } from "./etc/system-rpc";

export type ServerRpcRouter = typeof serverRpcRouter;

export const serverRpcRouter = rpc.router({
  system: systemRouter,
  ...gameServerRpcSlice,
});
