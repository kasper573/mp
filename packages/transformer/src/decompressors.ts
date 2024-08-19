import pako from "pako";

export const decompressors = {
  zlib: pako.inflate,
  zstd() {
    throw new Error("Not implemented");
  },
  gzip() {
    throw new Error("Not implemented");
  },
} satisfies Record<string, Decompressor>;

export type Decompressor = (str: Uint8Array) => Uint8Array;
