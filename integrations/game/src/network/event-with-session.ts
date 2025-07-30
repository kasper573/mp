import type { EventRouterMessage } from "@mp/event-router";
import type { UserSession } from "../user/session";
import { createEncoding } from "@mp/encoding";

export interface EventWithSession {
  event: EventRouterMessage<unknown>;
  session: UserSession;
}

export const eventWithSessionEncoding =
  createEncoding<EventWithSession>(44_000);
