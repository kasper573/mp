import type { DisconnectReason, ConnectReason } from "@mp/network/server";
import type { TimeSpan } from "@mp/time";
import { t } from "./factory";
import type { WorldModule } from "./world/module";
import type { AreaModule } from "./area/module";

export type GlobalModule = ReturnType<typeof createGlobalModule>;
export function createGlobalModule(modules: {
  world: WorldModule;
  area: AreaModule;
}) {
  return t.module({
    connect: t.procedure.input<ConnectReason>().create(),
    disconnect: t.procedure.input<DisconnectReason>().create(),
    tick: t.procedure.input<TimeSpan>().create(async (payload) => {
      await modules.world.tick(payload);
    }),
  });
}
