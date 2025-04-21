import { createEncoding } from "@mp/encoding";
import type { SyncMessage } from "./patch";

// Claiming the range 42_000 - 42_999 for the sync protocol
export const syncMessageEncoding = createEncoding<SyncMessage>(42_000);
