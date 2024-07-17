import type { Flattened } from "./flattened";
import type {
  OperationDefinition,
  OperationResolution,
  RouterDefinition,
  Unsubscribe,
} from "./shared";

export interface CreateClientOptions<Context> {
  url: string;
  context: () => Context;
}

export class Client<Context, Router extends RouterDefinition<Context>> {
  constructor(private options: CreateClientOptions<Context>) {}

  send<Name extends OperationName<Router>>(
    name: Name,
    input: OperationInput<Name, Router>,
  ): OperationResolution {}

  subscribe<Name extends OperationName<Router>>(
    name: Name,
    receiver: (input: OperationInput<Name, Router>) => void,
  ): Unsubscribe {
    return () => {};
  }
}

type OperationInput<Name extends OperationName<Router>, Router> =
  Flattened<Router>[Name] extends OperationDefinition<infer _, infer Input>
    ? Input
    : never;

type OperationName<Router> = keyof Flattened<Router>;
