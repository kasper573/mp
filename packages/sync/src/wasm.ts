import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
import { next as Automerge } from "@automerge/automerge/slim";

export async function initializeSyncWasm() {
  await Automerge.initializeBase64Wasm(automergeWasmBase64);
}
