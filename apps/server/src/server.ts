import type { inferModuleDefinitions } from "@mp/tsock/server";
import { Logger } from "@mp/tsock/server";
import { Server } from "@mp/tsock/server";
import {
  derivePlayerState as derivePlayerState,
  updateWorld,
  type World,
} from "@mp/data";
import { createPlayerModule } from "./modules/player";
import type { ConnectionModule } from "./modules/connection";
import { createConnectionModule } from "./modules/connection";
import type { ClientContext, ClientState, ServerContext } from "./context";

export function createServer(logger = new Logger(console)) {
  const world: World = {
    entities: new Map(),
  };

  const connection = createConnectionModule();
  const server = new Server<
    ServerModules,
    ServerContext,
    ClientContext,
    ClientState
  >({
    logger,
    modules: createModules(connection),
    connection,
    createContext({ clientId }): ServerContext {
      return { clientId, world, time: new Date() };
    },
  });

  function tick({ time }: { time: Date }) {
    updateWorld(world, time);

    for (const { id } of world.entities.values()) {
      server.sendClientState(id, derivePlayerState(world, id));
    }
  }

  return {
    listen: (port: number) => server.listen(port),
    tick,
  };
}

function createModules(connection: ConnectionModule) {
  return {
    player: createPlayerModule(connection),
  };
}

export type ServerModules = inferModuleDefinitions<
  ReturnType<typeof createModules>
>;
