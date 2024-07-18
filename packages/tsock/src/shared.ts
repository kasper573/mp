import type { Flattened } from "./flattened";

export class Initializer<Context> {
  context<Context>() {
    return new Initializer<Context>();
  }
  create(options?: FactoryOptions): Factory<Context> {
    return new Factory<Context>(options);
  }
}

interface FactoryOptions {
  transformer?: Transformer;
}

class Factory<Context> {
  constructor(private options?: FactoryOptions) {}

  router<Definition extends RouterDefinition<Context>>(
    def: Definition,
  ): Definition {
    return def;
  }

  event = new EventHandlerFactory<void, Context>();
}

export type RouterDefinition<Context> = {
  [K: PropertyKey]: AnyRouterOrEventDefinition<Context>;
};

export type AnyRouterOrEventDefinition<Context> =
  | RouterDefinition<Context>
  | AnyEventDefinition<Context>;

class EventHandlerFactory<Payload, Context> {
  payload<Payload>() {
    return new EventHandlerFactory<Payload, Context>();
  }

  create(
    handler: EventHandler<Payload, Context>,
  ): EventHandler<Payload, Context> {
    return handler;
  }
}

// We need to be able to use this as a generic constraint, and using "any" is the only way
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyEventDefinition<Context> = EventHandler<any, Context>;

export type EventHandler<Payload, Context> = (args: {
  payload: Payload;
  context: Context;
}) => EventResolution;

export type EventResolution = void;

export type EventPayload<Path extends EventPath<Router>, Router> =
  Flattened<Router>[Path] extends EventHandler<infer Payload, infer _>
    ? Payload
    : never;

export type EventPath<Router> = keyof Flattened<Router>;

export type SocketIO_ClientToServerEvents<Router, ClientContext> = {
  [Path in EventPath<Router>]: (
    payload: EventPayload<Path, Router>,
    clientContext: ClientContext,
  ) => void;
};

export type SocketIO_ServerToClientEvents<Router> = {
  [Path in EventPath<Router>]: (payload: EventPayload<Path, Router>) => void;
};

interface Transformer {
  stringify(object: unknown): string;
  parse<T>(string: string): T;
}

export type Unsubscribe = () => void;

export const transports = ["websocket"] as ["websocket"];
