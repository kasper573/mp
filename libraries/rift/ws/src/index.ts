import type {
  ClientTransport,
  ClientTransportEvent,
  ConnectionState,
} from "@rift/core";

export interface WebSocketLike {
  binaryType: BinaryType;
  readyState: number;
  addEventListener(type: "open", listener: (event: Event) => void): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent) => void,
  ): void;
  addEventListener(type: "close", listener: (event: CloseEvent) => void): void;
  addEventListener(type: "error", listener: (event: Event) => void): void;
  send(data: ArrayBufferLike | ArrayBufferView | Blob | string): void;
  close(code?: number, reason?: string): void;
}

export function wsTransport(ws: WebSocketLike): ClientTransport {
  const listeners = new Set<(ev: ClientTransportEvent) => void>();
  ws.binaryType = "arraybuffer";

  function emit(ev: ClientTransportEvent): void {
    for (const l of listeners) {
      l(ev);
    }
  }

  function state(): ConnectionState {
    switch (ws.readyState) {
      case WebSocket.CONNECTING:
        return "connecting";
      case WebSocket.OPEN:
        return "open";
      case WebSocket.CLOSING:
        return "closing";
      default:
        return "closed";
    }
  }

  ws.addEventListener("open", () => emit({ type: "open" }));
  ws.addEventListener("message", (event) => {
    const data = event.data;
    if (data instanceof ArrayBuffer) {
      emit({ type: "message", data: new Uint8Array(data) });
    } else if (data instanceof Uint8Array) {
      emit({ type: "message", data });
    } else if (data instanceof Blob) {
      void data
        .arrayBuffer()
        .then((buf) => emit({ type: "message", data: new Uint8Array(buf) }));
    }
  });
  ws.addEventListener("close", (event) => {
    emit({ type: "close", code: event.code, reason: event.reason });
  });
  ws.addEventListener("error", () => {
    emit({ type: "error", error: new Error("websocket error") });
  });

  return {
    get state() {
      return state();
    },
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    send(data) {
      ws.send(data);
    },
    close(code, reason) {
      ws.close(code, reason);
    },
  };
}
