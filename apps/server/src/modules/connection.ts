import type { DisconnectReason } from "@mp/tse/server";
import { t } from "./tse";

export type ConnectionModule = ReturnType<typeof createConnectionModule>;
export function createConnectionModule() {
  return t.module({
    connect: t.event.create(),
    disconnect: t.event.payload<DisconnectReason>().create(),
  });
}
