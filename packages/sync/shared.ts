import type http from "node:http";
import type { Branded } from "@mp/std";
import { decode, encode } from "cbor-x";
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
  decode(new Uint8Array(buffer)) as T;

export const decodeServerToClientMessage = fixedDecode as <ClientState>(
  data: ArrayBufferLike,
) => ServerToClientMessage<ClientState>;

export const encodeServerToClientMessage = encode as <ClientState>(
  message: ServerToClientMessage<ClientState>,
) => Uint8Array;

export type EventHandler<Payload> = (payload: Payload) => void;

export type StateMutation<State> = (state: State) => void;

export type StateHandler<State> = (updateState: StateMutation<State>) => void;

export type Unsubscribe = () => void;

export function handshakeDataFromRequest(
  req: http.IncomingMessage,
): HandshakeData {
  const url = new URL(req.url!, "http://localhost"); // .url is in fact a path, so baseUrl does not matter
  return { token: url.searchParams.get("token") ?? undefined };
}

export function createUrlWithHandshakeData(
  syncServerUrl: string,
  handshake: HandshakeData,
): string {
  const url = new URL(syncServerUrl);
  if (handshake.token) {
    url.searchParams.set("token", handshake.token);
  }
  return url.toString();
}
