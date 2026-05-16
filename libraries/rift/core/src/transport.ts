import type { ClientId } from "./protocol";

export type ConnectionState = "connecting" | "open" | "closing" | "closed";

export type ServerTransportEvent<Socket> =
  | {
      readonly type: "open";
      readonly clientId: ClientId;
      readonly socket: Socket;
    }
  | {
      readonly type: "message";
      readonly clientId: ClientId;
      readonly data: Uint8Array;
    }
  | {
      readonly type: "close";
      readonly clientId: ClientId;
      readonly code: RiftCloseCode;
      readonly reason: string;
    }
  | {
      readonly type: "error";
      readonly clientId: ClientId;
      readonly error: Error;
    };

export interface ServerTransport<Socket> {
  on(listener: (event: ServerTransportEvent<Socket>) => void): () => void;
  send(clientId: ClientId, data: Uint8Array<ArrayBuffer>): void;
  close(clientId: ClientId, code: RiftCloseCode, reason?: string): void;
  shutdown(code?: RiftCloseCode, reason?: string): Promise<void>;
}

export type ClientTransportEvent =
  | { readonly type: "open" }
  | { readonly type: "message"; readonly data: Uint8Array }
  | {
      readonly type: "close";
      readonly code: RiftCloseCode;
      readonly reason: string;
    }
  | { readonly type: "error"; readonly error: Error };

export interface ClientTransport {
  readonly state: ConnectionState;
  on(listener: (event: ClientTransportEvent) => void): () => void;
  send(data: Uint8Array<ArrayBuffer>): void;
  close(code?: RiftCloseCode, reason?: string): void;
}

export enum RiftCloseCode {
  // Starting at 4000 to avoid conflicts with WebSocket close codes
  Normal = 4001,
  SchemaMismatch = 4002,
  ProtocolError = 4003,
  HandshakeTimeout = 4004,
  ServerShutdown = 4005,
}
