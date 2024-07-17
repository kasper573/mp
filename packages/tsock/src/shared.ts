export class Initializer<Context> {
  context<Context>() {
    return new Initializer<Context>();
  }
  create(options?: FactoryOptions): Factory<Context> {
    return new Factory<Context>(options);
  }
}

export interface CreateContextOptions<ClientContext> {
  clientContext: ClientContext;
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

  operation = new OperationFactory<Context, void>();
}

export type RouterDefinition<Context> = {
  [K: PropertyKey]: AnyRouterOrOperationDefinition<Context>;
};

export type AnyRouterOrOperationDefinition<Context> =
  | RouterDefinition<Context>
  | AnyOperationDefinition<Context>;

class OperationFactory<Context, Input> {
  input<Input>() {
    return new OperationFactory<Context, Input>();
  }

  create(
    handler: OperationDefinition<Context, Input>,
  ): OperationDefinition<Context, Input> {
    return handler;
  }
}

interface OperationHandlerArgs<Context, Input> {
  context: Context;
  input: Input;
  emit: OperationEmitter<Input>;
}

export interface OperationEmitter<Input> {
  next: (value: Input) => void;
  error: (error: Error) => void;
  complete: () => void;
}

// We need to be able to use this as a generic constraint, and using "any" is the only way
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOperationDefinition<Context> = OperationDefinition<Context, any>;

export type OperationDefinition<Context, Input> = (
  args: OperationHandlerArgs<Context, Input>,
) => OperationResolution;

export type OperationInterfaceMap<Definition> = {
  [K in keyof Definition]: Definition[K] extends OperationDefinition<
    infer _,
    infer Input
  >
    ? OperationInterface<Input>
    : OperationInterfaceMap<Definition[K]>;
};

interface OperationInterface<Input> {
  (input: Input): OperationResolution;
  subscribe(callback: (input: Input) => void): Unsubscribe;
}

type OperationResolution = void;

interface Transformer {
  stringify(object: unknown): string;
  parse<T>(string: string): T;
}

export type Unsubscribe = () => void;
