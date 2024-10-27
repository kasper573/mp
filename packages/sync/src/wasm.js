import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
import { next as Automerge } from "@automerge/automerge/slim";

export async function initializeSyncWasm() {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  await Automerge.initializeBase64Wasm(automergeWasmBase64);
}
