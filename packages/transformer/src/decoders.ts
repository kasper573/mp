export const decoders = {
  base64(data) {
    const binaryString = atob(data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  },
  csv(data) {
    return Uint8Array.from(data.split(",").map(Number));
  },
} satisfies Record<string, Decoder>;

export type Decoder = (str: string) => Uint8Array;
