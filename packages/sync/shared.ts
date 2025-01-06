import type { Branded } from "@mp/std";
import { decode, encode } from "cbor2";
import type { Operation } from "rfc6902";

export type ClientId = Branded<string, "ClientId">;

export interface BaseSyncMessage<Type extends string> {
  type: Type;
}

export interface FullStateMessage<State> extends BaseSyncMessage<"full"> {
  state: State;
}

export interface PatchStateMessage extends BaseSyncMessage<"patch"> {
  patch: Operation[];
}

export interface HandshakeMessage
  extends BaseSyncMessage<"handshake">,
    HandshakeData {}

export interface HandshakeData {
  token?: string;
}

export type ServerToClientMessage<ClientState> =
  | FullStateMessage<ClientState>
  | PatchStateMessage;

export type ClientToServerMessage = HandshakeMessage;

const fixedDecode = <T>(buffer: ArrayBufferLike) =>
  decode<T>(new Uint8Array(buffer));

export const decodeServerToClientMessage = fixedDecode as <ClientState>(
  data: ArrayBufferLike,
) => ServerToClientMessage<ClientState>;

export const encodeServerToClientMessage = encode as <ClientState>(
  message: ServerToClientMessage<ClientState>,
) => Uint8Array;

export const decodeClientToServerMessage = fixedDecode as (
  data: ArrayBufferLike,
) => ClientToServerMessage;

export const encodeClientToServerMessage = encode as (
  message: ClientToServerMessage,
) => Uint8Array;

export type EventHandler<State> = (state: State) => void;

export type Unsubscribe = () => void;
