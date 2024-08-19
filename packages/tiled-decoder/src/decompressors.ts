import pako from "pako";
import type { Compression } from "@mp/tiled-loader";

export const decompressors: Record<Compression, Decompressor> = {
  none(data) {
    return data;
  },
  zlib: pako.inflate,
  zstd() {
    throw new Error("Not implemented");
  },
  gzip() {
    throw new Error("Not implemented");
  },
};

type Decompressor = (str: Uint8Array) => Uint8Array;
