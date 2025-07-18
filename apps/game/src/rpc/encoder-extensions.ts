import { addEncoderExtension } from "@mp/encoding";
import type { RectComponents } from "@mp/math";
import { Rect, Vector } from "@mp/math";
import { SyncMap } from "@mp/sync";

import { NpcInstance } from "../npc/types";
import { Character } from "../character/types";

export function registerEncoderExtensions(): void {
  // All tags below this are reserved by @mp/encoding
  let startTag = 40_501;
  const nextTag = () => ++startTag;

  // Claiming the range 40_501 - 40_999 for the game protocol

  addEncoderExtension<Vector<number>, [number, number]>({
    Class: Vector<number>,
    tag: nextTag(),
    encode: (v, encode) => encode([v.x, v.y]),
    decode: (v) => new Vector(v[0], v[1]),
  });

  addEncoderExtension<Rect<number>, RectComponents<number>>({
    Class: Rect<number>,
    tag: nextTag(),
    encode: (v, encode) => encode([v.x, v.y, v.width, v.height]),
    decode: (v) => new Rect(...v),
  });

  addEncoderExtension<Error, { name: string; stack?: string; message: string }>(
    {
      Class: Error,
      tag: nextTag(),
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

  addEncoderExtension<SyncMap<unknown, unknown>, Array<[unknown, unknown]>>({
    Class: SyncMap,
    tag: nextTag(),
    encode: (map, encode) => encode(map.entries().toArray()),
    decode: (entries) => new SyncMap(entries),
  });

  addEncoderExtension<Character, Partial<Character>>({
    Class: Character as never,
    tag: nextTag(),
    encode: (character, encode) => encode(character.snapshot()),
    decode: (snapshot) => new Character(snapshot as Character),
  });

  addEncoderExtension<NpcInstance, Partial<NpcInstance>>({
    Class: NpcInstance as never,
    tag: nextTag(),
    encode: (npc, encode) => encode(npc.snapshot()),
    decode: (snapshot) => new NpcInstance(snapshot as NpcInstance),
  });
}
