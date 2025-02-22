import { decode } from "cbor-x";
import type { Patch } from "./patch";

const fixedDecode = <T>(buffer: ArrayBufferLike) =>
  decode(new Uint8Array(buffer)) as T;

export const decodeServerToClientMessage = fixedDecode as <State>(
  data: ArrayBufferLike,
) => ServerToClientMessage<State>;

type ServerToClientMessage<State> = Patch; // aliased as we will be adding more message types later
