import { addEncoderExtension } from "@mp/encoding";
import type { RectComponents } from "@mp/math";
import { Rect, Vector } from "@mp/math";

export function registerEncoderExtensions(): void {
  // All tags below this are reserved by @mp/encoding
  const startTag = 40_501;

  // Claiming the range 40_500 - 40_999 for the game protocol

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

  addEncoderExtension<Error, { name: string; stack?: string; message: string }>(
    {
      Class: Error,
      tag: startTag + 3,
      encode: (error, encode) =>
        encode({
          message: error.message,
          name: error.name,
          stack: error.stack,
        }),
      decode: (v) => {
        const error = new Error(v.message);
        error.name = v.name;
        if (v.stack) {
          error.stack = v.stack;
        }
        return error;
      },
    },
  );
}
