import { rpc } from "@mp/game/server";
import { gameServerRpcSlice } from "@mp/game/server";
import { systemRouter } from "./etc/system-rpc";

export type ServerRpcRouter = typeof serverRpcRouter;

export const serverRpcRouter = rpc.router({
  system: systemRouter,
  ...gameServerRpcSlice,
});

// Export the new API and area server types
export type {
  ApiServerRpcRouter,
  AreaServerRpcRouter,
} from "./rpc/api-server-rpc";
