import Piscina from "piscina";
import type { Patch } from "./patch";

export type MessageEncoder = ReturnType<typeof createMessageEncoder>;

export function createMessageEncoder() {
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
