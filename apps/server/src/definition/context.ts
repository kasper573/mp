import type { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";

export function createContext({
  info,
}: CreateWSSContextFnOptions): ServerContext {
  return info.connectionParams as ServerContext;
}

export type ServerContext = {
  clientId: string;
};
