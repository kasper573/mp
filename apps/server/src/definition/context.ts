import type { CreateContextOptions } from "@mp/tsock/server";

export function createContext({
  clientContext,
}: CreateContextOptions<ServerContext>): ServerContext {
  return clientContext;
}

export interface ServerContext {
  clientId: string;
}
