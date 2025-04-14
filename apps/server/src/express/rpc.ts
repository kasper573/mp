import type { AnyRouterNode } from "@mp/rpc";
import type express from "express";

export function createExpressRpcMiddleware<Context>(opt: {
  onError?: (opt: { path: string[]; error: unknown }) => void;
  router: AnyRouterNode<Context>;
  createContext: (req: express.Request) => Context;
}): express.RequestHandler {
  return (req, res) => {};
}
