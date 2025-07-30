import type { AreaId } from "@mp/db/types";
import { addEncoderExtension } from "@mp/encoding";
import type { RectComponents } from "@mp/math";
import { Rect, Vector } from "@mp/math";
import { SyncMap } from "@mp/sync";
import type { CharacterInit } from "../character/types";
import { Character } from "../character/types";
import { GameStateAreaEntity } from "../game-state/game-state";
import type { NpcInstanceInit } from "../npc/types";
import { NpcInstance } from "../npc/types";

let hasRegistered = false;

export function registerEncoderExtensions(): void {
  if (hasRegistered) {
    throw new Error("Encoder extensions have already been registered");
  }

  hasRegistered = true;

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

  addEncoderExtension<Character, CharacterInit>({
    Class: Character,
    tag: nextTag(),
    encode: (character, encode) =>
      encode(character.snapshot() as CharacterInit),
    decode: (init) => new Character(init),
  });

  addEncoderExtension<NpcInstance, NpcInstanceInit>({
    Class: NpcInstance,
    tag: nextTag(),
    encode: (npc, encode) => encode(npc.snapshot() as NpcInstanceInit),
    decode: (init) => new NpcInstance(init),
  });

  addEncoderExtension<GameStateAreaEntity, { id: AreaId }>({
    Class: GameStateAreaEntity,
    tag: nextTag(),
    encode: ({ id }, encode) => encode({ id }),
    decode: (init) => new GameStateAreaEntity(init),
  });
}
