// ----------------------------------------------------
// General purpose encoder extensions
// ----------------------------------------------------

import { addEncoderExtension } from "@mp/encoding";
import type { RectComponents } from "@mp/math";
import { Rect, Vector } from "@mp/math";
import { TimeSpan } from "@mp/time";
import { EncoderTag } from "./encoding";

let hasRegistered = false;

export function registerEncoderExtensions(): void {
  if (hasRegistered) {
    throw new Error("Encoder extensions have already been registered");
  }

  hasRegistered = true;

  addEncoderExtension<TimeSpan, number>({
    Class: TimeSpan as never,
    tag: EncoderTag.TimeSpan,
    encode: (v) => v.totalMilliseconds,
    decode: (v) => TimeSpan.fromMilliseconds(v),
  });

  addEncoderExtension<Vector<number>, [number, number]>({
    Class: Vector<number>,
    tag: EncoderTag.Vector,
    encode: (v, encode) => encode([v.x, v.y]),
    decode: (v) => new Vector(v[0], v[1]),
  });

  addEncoderExtension<Rect<number>, RectComponents<number>>({
    Class: Rect<number>,
    tag: EncoderTag.Rect,
    encode: (v, encode) => encode([v.x, v.y, v.width, v.height]),
    decode: (v) => new Rect(...v),
  });

  addEncoderExtension<Error, { name: string; stack?: string; message: string }>(
    {
      Class: Error,
      tag: EncoderTag.Error,
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
