import type { DisconnectReason, ConnectReason } from "@mp/network/server";
import type { TimeSpan } from "@mp/state";
import { t } from "./factory";

export type GlobalModule = ReturnType<typeof createGlobalModule>;
export function createGlobalModule() {
  return t.module({
    connect: t.procedure.input<ConnectReason>().create(),
    disconnect: t.procedure.input<DisconnectReason>().create(),
    tick: t.procedure.input<TimeSpan>().create(),
  });
}
