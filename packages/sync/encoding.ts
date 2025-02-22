import { decode, encodeAsAsyncIterable, encode } from "cbor-x";
import type { Patch } from "./patch";

const fixedDecode = <T>(buffer: ArrayBufferLike) =>
  decode(new Uint8Array(buffer)) as T;

export const decodeServerToClientMessage = fixedDecode as <State>(
  data: ArrayBufferLike,
) => ServerToClientMessage<State>;

export const encodeServerToClientMessage = encode as <State>(
  message: ServerToClientMessage<State>,
) => Uint8Array;

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

type ServerToClientMessage<State> = Patch; // aliased as we will be adding more message types later
