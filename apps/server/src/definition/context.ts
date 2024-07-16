import type { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";

export function createContext({ req }: CreateWSSContextFnOptions) {
  const headers = req.headers as unknown as ServerConnectionParams;
  return {
    clientId: headers["client-id"],
  };
}

export type ServerContext = Awaited<ReturnType<typeof createContext>>;

export type ServerConnectionParams = {
  "client-id": string;
};
