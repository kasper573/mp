import { createEncoding } from "@mp/encoding";
import type { Patch } from "./patch";

// Claiming the range 42_000 - 42_999 for the sync protocol
export const syncPatchEncoding = createEncoding<Patch>(42_000);
