import type { DisconnectReason, ConnectReason } from "@mp/network/server";
import type { TimeSpan } from "@mp/time";
import { t } from "./factory";
import type { WorldModule } from "./world/module";
import type { AreaModule } from "./area/module";

export type GlobalModule = ReturnType<typeof createGlobalModule>;
export function createGlobalModule({
  world,
}: {
  world: WorldModule;
  area: AreaModule;
}) {
  return t.module({
    connect: t.procedure.input<ConnectReason>().create(),
    disconnect: t.procedure
      .input<DisconnectReason>()
      .create(async (payload) => {
        await world.leave(payload);
      }),
    tick: t.procedure.input<TimeSpan>().create(async (payload) => {
      await world.tick(payload);
    }),
  });
}
