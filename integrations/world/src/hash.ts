export function fnv1a64(input: Uint8Array): Uint8Array {
  const mask = 0xffffffffffffffffn;
  const prime = 0x100000001b3n;
  let h = 0xcbf29ce484222325n;
  for (const byte of input) {
    h ^= BigInt(byte);
    h = (h * prime) & mask;
  }
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, h, false);
  return out;
}
