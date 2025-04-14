import type { AnyRouterNode, RPCError } from "@mp/rpc";
import type { WebSocketServer } from "@mp/ws/server";

export function acceptRpcViaWebSockets<Context>(opt: {
  wss: WebSocketServer;
  onError?: (error: RPCError) => void;
  router: AnyRouterNode<Context>;
  createContext: (socket: WebSocket) => Context;
}) {}
