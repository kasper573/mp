import type http from "node:http";
import { type Result } from "@mp/std";
import { WebSocketServer } from "ws";
import type { ClientId } from "../../sync/shared";

export interface WSSWithHandshakeOptions<HandshakePayload> {
  httpServer: http.Server;
  path: string;
  handshake: WSSHandshakeFn<HandshakePayload>;
  createClientId: () => ClientId;
  onError?: (...args: unknown[]) => unknown;
  onConnection?: (
    ws: WebSocket,
    handshake: WSSHandshake<HandshakePayload>,
  ) => unknown;
}

export function createWSSWithHandshake<HandshakePayload>(
  opt: WSSWithHandshakeOptions<HandshakePayload>,
) {
  const handshakes = new Map<
    http.IncomingMessage,
    { clientId: ClientId; payload: HandshakePayload }
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
    const clientId = opt.createClientId();

    try {
      const result = await opt.handshake(clientId, req);

      if (result.isOk()) {
        handshakes.set(req, { clientId, payload: result.value });
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

export interface WSSHandshake<Payload> {
  clientId: ClientId;
  payload: Payload;
}

export type WSSHandshakeFn<Payload> = (
  clientId: ClientId,
  req: http.IncomingMessage,
) => Promise<Result<Payload, string>>;
