import type { DisconnectReason } from "@mp/network/server";
import { t } from "./factory";

export type ConnectionModule = ReturnType<typeof createConnectionModule>;
export function createConnectionModule() {
  return t.module({
    connect: t.event.create(),
    disconnect: t.event.payload<DisconnectReason>().create(),
  });
}
