import type { CreateContextOptions } from "@mp/tsock";

export function createContext({
  clientContext,
}: CreateContextOptions<ServerContext>): ServerContext {
  return clientContext;
}

export interface ServerContext {
  clientId: string;
}
