import { Factory, Server } from "@mp/tsock/server";

import { createExampleModule } from "./modules/example";
import { createOtherModule } from "./modules/other";
export type * from "./modules/example";

export function createServer() {
  return new Server({
    modules: createModules(),
    createContext,
  });
}

function createModules() {
  const other = createOtherModule();
  const example = createExampleModule(other);
  return {
    example,
    other,
  };
}

export type ServerModules = ReturnType<typeof createModules>;

function createContext(clientContext: ClientContext): ServerContext {
  return clientContext;
}

export interface ServerContext extends ClientContext {}

export interface ClientContext {
  clientId: string;
}

export const t = new Factory<ServerContext>();
