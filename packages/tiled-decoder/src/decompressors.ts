import pako from "pako";
import { Compression } from "@mp/tiled-loader";

export const decompressors: Record<Compression, Decompressor> = {
  [Compression.None](data) {
    return data;
  },
  [Compression.Zlib]: pako.inflate,
  [Compression.Zstd]() {
    throw new Error("Not implemented");
  },
  [Compression.Gzip]() {
    throw new Error("Not implemented");
  },
};

type Decompressor = (str: Uint8Array) => Uint8Array;
