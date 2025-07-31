import { createEncoding } from "@mp/encoding";
import type { EventRouterMessage } from "./event-invoker";

// Claiming the range 43_000 - 43_999 for the binary event protocol
export const eventMessageEncoding =
  createEncoding<EventRouterMessage<unknown>>(43_000);
