import type { OperationInterfaceMap, RouterDefinition } from "./shared";

export interface CreateClientOptions<Context> {
  url: string;
  context: () => Context;
}

export class Client<Context, Router extends RouterDefinition<Context>> {
  events: OperationInterfaceMap<Router> = {} as OperationInterfaceMap<Router>;
  constructor(private options: CreateClientOptions<Context>) {}
}
