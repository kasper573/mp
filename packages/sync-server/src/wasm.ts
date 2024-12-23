import path from "node:path";
import fs from "node:fs/promises";
import wasmUrl from "@automerge/automerge/automerge.wasm?url";
import { next as Automerge } from "@automerge/automerge/slim";

await Automerge.initializeWasm(
  fs.readFile(path.resolve(import.meta.dirname, wasmUrl.replace("?url", ""))),
);
