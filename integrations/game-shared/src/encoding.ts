import type { CharacterId } from "@mp/db/types";
import { createEncoding } from "@mp/encoding";
import type { EventRouterMessage } from "@mp/event-router";
import type { AnyPatch, SyncEvent } from "@mp/sync";
import type { UserSession } from "./session";

// Claiming the range 40_501+ for the game protocol
// (Anything below 40_500 is reserved by cbor)
export enum EncoderTag {
  // General
  Vector = 40_501,
  Rect = 40_502,
  Error = 40_503,

  // System
  SyncMessage = 40_504,
  SyncMessageWithRecipient = 40_505,
  EventMessage = 40_506,
  EventWithSession = 40_507,
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
