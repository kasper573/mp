import type { DisconnectReason } from "@mp/network/server";
import type { TimeSpan } from "@mp/state";
import { t } from "./factory";

export type GlobalModule = ReturnType<typeof createGlobalModule>;
export function createGlobalModule() {
  return t.module({
    connect: t.event.create(),
    disconnect: t.event.payload<DisconnectReason>().create(),
    tick: t.event.payload<TimeSpan>().create(),
  });
}
