import Piscina from "piscina";
import { encode } from "cbor-x";
import type { Patch } from "./patch";

export type MessageEncoder = ReturnType<typeof createWorkerThreadEncoder>;

export function createWorkerThreadEncoder() {
  const piscina = new Piscina({
    filename: new URL("messageEncoder.worker.mjs", import.meta.url).href,
  });
  return {
    encode(patch: Patch): Promise<Uint8Array> {
      return piscina.run(patch);
    },
    dispose() {
      void piscina.close();
    },
  };
}

export function createSyncEncoder(): MessageEncoder {
  return {
    encode: (patch) => Promise.resolve(encode(patch)),
    dispose: () => {},
  };
}
