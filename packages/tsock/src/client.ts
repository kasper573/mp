import type { OperationInterfaceMap, RouterDefinition } from "./shared";

export function createClient<Context, Router extends RouterDefinition<Context>>(
  options: CreateClientOptions<Context>,
): Client<Context, Router> {
  return {} as Client<Context, Router>;
}

interface CreateClientOptions<Context> {
  url: string;
  context: () => Context;
}

export interface Client<Context, Router extends RouterDefinition<Context>> {
  events: OperationInterfaceMap<Router>;
}
