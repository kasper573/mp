import {
  type ClientId,
  type ServerTransportEvent,
  type ServerTransport,
  RiftCloseCode,
} from "@rift/core";
import type { WebSocket, WebSocketServer } from "ws";

export function wssTransport(wss: WebSocketServer): ServerTransport {
  const listeners = new Set<(ev: ServerTransportEvent) => void>();
  const sockets = new Map<ClientId, WebSocket>();
  let nextId = 1;

  function emit(ev: ServerTransportEvent): void {
    for (const l of listeners) {
      l(ev);
    }
  }

  wss.on("connection", (socket: WebSocket) => {
    const id = nextId++ as ClientId;
    sockets.set(id, socket);
    socket.binaryType = "nodebuffer";
    socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
      let bytes: Uint8Array;
      if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data);
      } else if (Array.isArray(data)) {
        const total = data.reduce((n, b) => n + b.byteLength, 0);
        bytes = new Uint8Array(total);
        let offset = 0;
        for (const b of data) {
          bytes.set(
            new Uint8Array(b.buffer, b.byteOffset, b.byteLength),
            offset,
          );
          offset += b.byteLength;
        }
      } else {
        bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      }
      emit({ type: "message", clientId: id, data: bytes });
    });
    socket.on("close", (code: number, reason: Buffer) => {
      sockets.delete(id);
      emit({
        type: "close",
        clientId: id,
        code,
        reason: reason.toString("utf-8"),
      });
    });
    socket.on("error", (error: Error) => {
      emit({ type: "error", clientId: id, error });
    });
    emit({ type: "open", clientId: id, ws: socket });
  });

  return {
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    send(clientId, data) {
      const sock = sockets.get(clientId);
      if (!sock || sock.readyState !== sock.OPEN) {
        return;
      }
      sock.send(data, { binary: true });
    },
    close(clientId, code, reason) {
      const sock = sockets.get(clientId);
      if (!sock) {
        return;
      }
      sock.close(code, reason);
    },
    shutdown(code = RiftCloseCode.Normal, reason = "shutdown") {
      for (const sock of sockets.values()) {
        sock.close(code, reason);
      }
      sockets.clear();
      return new Promise<void>((resolve, reject) => {
        wss.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
  };
}
