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
      .create(({ input: reason, context: { clientId, logger, clients } }) => {
        logger.info("Client disconnected", { reason });
        if (clientId) {
          logger.info("Removing from client registry");
          clients.delete(clientId);
        }
      }),
    tick: t.procedure.input<TimeSpan>().create(async (payload) => {
      await world.tick(payload);
    }),
  });
}
