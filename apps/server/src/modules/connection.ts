import { t } from "../tsock";

export type ConnectionModule = ReturnType<typeof createConnectionModule>;
export function createConnectionModule() {
  return t.module({
    connect: t.event.create(),
    disconnect: t.event.create(),
  });
}
