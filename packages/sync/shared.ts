import type http from "node:http";
import type { Branded } from "@mp/std";
import { decode, encodeAsAsyncIterable } from "cbor-x";
import type { Patch } from "rfc6902";

export type ClientId = Branded<string, "ClientId">;

export interface HandshakeData {
  token?: string;
}

export type ServerToClientMessage<State> = Patch;

const fixedDecode = <T>(buffer: ArrayBufferLike) =>
  decode(new Uint8Array(buffer)) as T;

export const decodeServerToClientMessage = fixedDecode as <State>(
  data: ArrayBufferLike,
) => ServerToClientMessage<State>;

export const encodeServerToClientMessage = encodeAsync as <State>(
  message: ServerToClientMessage<State>,
) => Promise<Uint8Array>;

async function encodeAsync<T>(data: T): Promise<Uint8Array> {
  return new Uint8Array(
    await asyncIterableToArrayBuffer(encodeAsAsyncIterable(data)),
  );
}

async function asyncIterableToArrayBuffer(
  asyncIterable: AsyncIterable<Buffer>,
): Promise<ArrayBuffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of asyncIterable) {
    chunks.push(chunk);
  }

  const combinedBuffer = Buffer.concat(chunks);

  return combinedBuffer.buffer.slice(
    combinedBuffer.byteOffset,
    combinedBuffer.byteOffset + combinedBuffer.byteLength,
  );
}

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
