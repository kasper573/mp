import type { CharacterId } from "@mp/db/types";
import { addEncoderExtension, createEncoding } from "@mp/encoding";
import type { EventRouterMessage } from "@mp/event-router";
import type { RectComponents } from "@mp/math";
import { Rect, Vector } from "@mp/math";
import type { AnyPatch, SyncEvent } from "@mp/sync";
import type { UserSession } from "./session";

// Claiming the range 40_501+ for the game protocol
// (Anything below 40_500 is reserved by cbor)
export enum EncoderTag {
  Vector = 40_501,
  Rect = 40_502,
  Error = 40_503,
  NpcInstance = 40_504,
  NpcEtc = 40_505,
  AppearanceTrait = 40_506,
  MovementTrait = 40_507,
  CombatTrait = 40_508,
  Character = 40_509,
  CharacterProgression = 40_510,
  GameServiceArea = 40_511,
  SyncMessage = 40_512,
  SyncMessageWithRecipient = 40_513,
  EventWithSession = 40_514,
}

// Makes the @tracked decorator use the EncoderTag type
declare module "@mp/sync" {
  export interface TrackedRegistry {
    tag: EncoderTag;
  }
}

// ----------------------------------------------------
// Special encodings
// ----------------------------------------------------

export type SyncMessage = [
  AnyPatch | undefined,
  serverTime: Date,
  events?: SyncEvent[],
];
export const syncMessageEncoding = createEncoding<SyncMessage>(
  EncoderTag.SyncMessage,
);

export type SyncMessageWithRecipient = [SyncMessage, CharacterId];
export const syncMessageWithRecipientEncoding =
  createEncoding<SyncMessageWithRecipient>(EncoderTag.SyncMessageWithRecipient);

export interface EventWithSession {
  event: EventRouterMessage<unknown>;
  session: UserSession;
}
export const eventWithSessionEncoding = createEncoding<EventWithSession>(
  EncoderTag.EventWithSession,
);

// ----------------------------------------------------
// General purpose encoder extensions
// ----------------------------------------------------

let hasRegistered = false;

export function registerEncoderExtensions(): void {
  if (hasRegistered) {
    throw new Error("Encoder extensions have already been registered");
  }

  hasRegistered = true;

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
