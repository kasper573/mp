import type { Encoding } from "@mp/tiled-loader";

export const decoders: Record<Encoding, Decoder> = {
  base64(data) {
    const binaryString = atob(data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  },
  csv(data) {
    throw new Error("Not implemented");
  },
};

type Decoder = (str: string) => Uint8Array;
