import type { CreateServerContextOptions } from "@mp/tsock/server";

export function createContext({
  clientId,
}: CreateServerContextOptions<ClientContext>): ServerContext {
  return { clientId };
}

export interface ServerContext {
  clientId: string;
}

export interface ClientContext {}
