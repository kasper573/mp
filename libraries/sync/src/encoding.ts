import type { Encoding } from "@mp/encoding";
import { createEncoding } from "@mp/encoding";
import type { SyncMessage } from "./patch";
import type { FlushResult } from "./sync-server";

// Claiming the range 42_000 - 42_999 for the sync protocol
export const syncMessageEncoding = createEncoding<SyncMessage>(42_000);
export function flushResultEncoding<ClientId>() {
  return flushResultEncodingImpl as Encoding<[FlushResult<ClientId>, Date]>;
}

const flushResultEncodingImpl =
  createEncoding<[FlushResult<unknown>, Date]>(42_001);
