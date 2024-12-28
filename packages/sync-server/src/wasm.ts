// @ts-expect-error has no typedefs
import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
import { next as Automerge } from "@automerge/automerge/slim";

await Automerge.initializeBase64Wasm(automergeWasmBase64 as string);
