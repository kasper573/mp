import { rpc } from "@mp/game/server";
import { gameServerRpcSlice } from "@mp/game/server";
import { systemRouter } from "../etc/system-rpc";

export type AreaServerRpcRouter = typeof areaServerRpcRouter;

export const areaServerRpcRouter = rpc.router({
  system: systemRouter,
  ...gameServerRpcSlice,
});
