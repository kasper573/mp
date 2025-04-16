import { addEncoderExtension } from "@mp/encoding";
import type { RectComponents } from "@mp/math";
import { Rect, Vector } from "@mp/math";

// This file is used both in client and server, so

export function registerEncoderExtensions(): void {
  // All tags below this are reserved by @mp/encoding
  const startTag = 40_501;
  addEncoderExtension<Vector<number>, [number, number]>({
    Class: Vector<number>,
    tag: startTag,
    encode: (v, encode) => encode([v.x, v.y]),
    decode: (v) => new Vector(v[0], v[1]),
  });

  addEncoderExtension<Rect<number>, RectComponents<number>>({
    Class: Rect<number>,
    tag: startTag + 1,
    encode: (v, encode) => encode([v.x, v.y, v.width, v.height]),
    decode: (v) => Rect.fromComponents(...v),
  });
}
