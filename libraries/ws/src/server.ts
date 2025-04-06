import type http from "node:http";
import { type Result } from "@mp/std";
import { WebSocketServer } from "ws";

export { type WebSocketServer } from "ws";

export interface WSSWithHandshakeOptions<HandshakePayload, SocketId> {
  httpServer: http.Server;
  path: string;
  handshake: WSSHandshakeFn<HandshakePayload, SocketId>;
  createSocketId: () => SocketId;
  onError?: (...args: unknown[]) => unknown;
  onConnection?: (
    ws: WebSocket,
    handshake: WSSHandshake<HandshakePayload, SocketId>,
  ) => unknown;
}

export function createWSSWithHandshake<HandshakePayload, SocketId>(
  opt: WSSWithHandshakeOptions<HandshakePayload, SocketId>,
): WebSocketServer {
  const handshakes = new Map<
    http.IncomingMessage,
    WSSHandshake<HandshakePayload, SocketId>
  >();

  const wss = new WebSocketServer({
    server: opt.httpServer,
    path: opt.path,
    verifyClient: ({ req }, callback) => {
      void verifyClient(req).then((success) => {
        if (success) {
          callback(true);
        } else {
          callback(false, 401, "Unauthorized");
        }
      });
    },
  });

  wss.addListener("connection", (ws, req) => {
    const handshake = handshakes.get(req);
    handshakes.delete(req);
    if (!handshake) {
      opt.onError?.(
        "Connection received but no handshake available for request",
      );
      return;
    }
    opt.onConnection?.(ws as unknown as WebSocket, handshake);
  });

  return wss;

  async function verifyClient(req: http.IncomingMessage) {
    const id = opt.createSocketId();

    try {
      const result = await opt.handshake(id, req);

      if (result.isOk()) {
        handshakes.set(req, { id, payload: result.value });
        return true;
      } else {
        opt.onError?.("Handshake failed", result.error);
      }
    } catch (error) {
      opt.onError?.("Error during handshake", error);
      // noop
    }

    return false;
  }
}

export interface WSSHandshake<Payload, SocketId> {
  id: SocketId;
  payload: Payload;
}

export type WSSHandshakeFn<Payload, SocketId> = (
  id: SocketId,
  req: http.IncomingMessage,
) => Promise<Result<Payload, string>>;
