import type { inferModuleDefinitions } from "@mp/tsock/server";
import { Logger } from "@mp/tsock/server";
import { Server } from "@mp/tsock/server";
import { createPlayerModule } from "./modules/player";
import type { ConnectionModule } from "./modules/connection";
import { createConnectionModule } from "./modules/connection";
import type { ServerContext } from "./context";
import { createContext } from "./context";

export function createServer(logger = new Logger(console)) {
  const connection = createConnectionModule();
  const modules = createExposedModules(connection);
  const server = new Server({
    modules,
    connection,
    createContext,
    logger,
  });

  const context: ServerContext = { clientId: "server" };

  function tick(payload: { deltaTime: number }) {
    modules.player.tick({ payload, context });
  }

  return {
    listen: (port: number) => server.listen(port),
    tick,
  };
}

function createExposedModules(connection: ConnectionModule) {
  return {
    player: createPlayerModule(connection),
  };
}

export type ServerModules = inferModuleDefinitions<
  ReturnType<typeof createExposedModules>
>;
