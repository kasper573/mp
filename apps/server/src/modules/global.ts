import type { DisconnectReason, ConnectReason } from "@mp/network/server";
import type { TimeSpan } from "@mp/state";
import { t } from "./factory";

export type GlobalModule = ReturnType<typeof createGlobalModule>;
export function createGlobalModule() {
  return t.module({
    connect: t.event.payload<ConnectReason>().create(),
    disconnect: t.event.payload<DisconnectReason>().create(),
    tick: t.event.payload<TimeSpan>().create(),
  });
}
