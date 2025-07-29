import { createEncoding } from "@mp/encoding";
import type { SyncMessage } from "@mp/sync";
import type { CharacterId } from "../character/types";

// Claiming the range 42_000 - 42_999 for the sync protocol
export const syncMessageEncoding = createEncoding<SyncMessage>(42_000);

export type SyncMessageWithRecipient = [SyncMessage, CharacterId];
export const syncMessageWithRecipientEncoding =
  createEncoding<SyncMessageWithRecipient>(42_001);
