import { initializeBase64Wasm } from "@automerge/automerge/slim";

// @ts-expect-error No types exist for this import
import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";

// It is okay to void this because initializing via base64 is synchronous
void initializeBase64Wasm(automergeWasmBase64 as string);
