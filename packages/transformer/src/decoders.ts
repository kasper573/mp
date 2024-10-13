export const decoders = {
  base64(data) {
    const binaryString = atob(data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      const byte = binaryString.codePointAt(i);
      if (byte === undefined) {
        throw new Error("Invalid base64 string");
      }
      bytes[i] = byte;
    }
    return bytes;
  },
  csv(data) {
    return Uint8Array.from(data.split(",").map(Number));
  },
} satisfies Record<string, Decoder>;

export type Decoder = (str: string) => Uint8Array;
