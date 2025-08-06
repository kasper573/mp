import type { CharacterId } from "@mp/db/types";
import { createEncoding } from "@mp/encoding";
import type { EventRouterMessage } from "@mp/event-router";
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
  EventMessage = 40_514,
  EventWithSession = 40_515,
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
export const eventMessageEncoding = createEncoding<EventRouterMessage<unknown>>(
  EncoderTag.EventMessage,
);
