import { createEncoding } from "@mp/encoding";
import type { Patch } from "./patch";

export const syncPatchEncoding = createEncoding<Patch>(42_000);
