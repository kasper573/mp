import { rpc } from "@mp/game/server";
import { systemRouter } from "../etc/system-rpc";
import { assetsRouterSlice } from "@mp/game/server";
import { areaServerDiscoveryRouter } from "./area-server-discovery";
import type { areaServerRpcRouter } from "./area-server-rpc";

export type ApiServerRpcRouter = typeof apiServerRpcRouter;
export type AreaServerRpcRouter = typeof areaServerRpcRouter;

export const apiServerRpcRouter = rpc.router({
  system: systemRouter,
  ...assetsRouterSlice,
  areaServerDiscovery: areaServerDiscoveryRouter,
});
