import { rpc } from "@mp/game/server";
import { systemRouter } from "../etc/system-rpc";
import { assetsRouterSlice } from "@mp/game/server";
import { areaServerDiscoveryRouter } from "./area-server-discovery";

export type ApiServerRpcRouter = typeof apiServerRpcRouter;

export const apiServerRpcRouter = rpc.router({
  system: systemRouter,
  ...assetsRouterSlice,
  areaServerDiscovery: areaServerDiscoveryRouter,
});