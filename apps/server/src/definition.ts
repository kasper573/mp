import type {
  CreateServerContextOptions,
  inferModuleDefinitions,
} from "@mp/tsock/server";
import { Logger } from "@mp/tsock/server";
import { Factory, Server } from "@mp/tsock/server";
import { createPlayerModule } from "./modules/player";
import type { ConnectionModule } from "./modules/connection";
import { createConnectionModule } from "./modules/connection";

export type * from "./modules/scene";
export type * from "./modules/player";
export type * from "./modules/entity";

export function createServer(logger = new Logger(console)) {
  const connection = createConnectionModule();
  const server = new Server({
    modules: createExposedModules(connection),
    connection,
    createContext,
    logger,
  });

  return server;
}

function createExposedModules(connection: ConnectionModule) {
  return {
    player: createPlayerModule(connection),
  };
}

export type ServerModules = inferModuleDefinitions<
  ReturnType<typeof createExposedModules>
>;

function createContext({
  clientId,
}: CreateServerContextOptions<ClientContext>): ServerContext {
  return { clientId };
}

export interface ServerContext {
  clientId: string;
}

export interface ClientContext {}

export const t = new Factory<ServerContext>();
