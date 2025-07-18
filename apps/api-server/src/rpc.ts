import { rpc } from "@mp/game/server";
import { systemRouter } from "./system-rpc";
import { assetsRouter } from "./assets-rpc";

export type ApiServerRpcRouter = typeof apiServerRpcRouter;

export const apiServerRpcRouter = rpc.router({
  system: systemRouter,
  assets: assetsRouter,
});
