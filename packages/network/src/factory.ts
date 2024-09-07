import type { ProcedureOutput } from "./dispatcher";
import type {
  ProcedureDefinition,
  ProcedureHandler,
  ProcedureType,
  AnyProcedureRecord,
  Module,
  ProcedurePayload,
  isVoidOrUndefined,
} from "./module";
import { createModule } from "./module";

export class Factory<Context> {
  module<Procedures extends AnyProcedureRecord>(
    procedures: Procedures,
  ): Module<Procedures> {
    return createModule(procedures);
  }

  procedure: ModuleProcedureFactory<Context, "client-to-server", void, void>;

  constructor({
    middleware = passThroughMiddleware,
  }: FactoryOptions<Context> = {}) {
    this.procedure = new ModuleProcedureFactory(
      "client-to-server",
      middleware as ModuleMiddleware<void, void, Context>,
    );
  }
}

export interface FactoryOptions<Context> {
  middleware?: ModuleMiddleware<unknown, unknown, Context>;
}

export type ModuleMiddleware<Input, Output, Context> = (
  payload: ProcedurePayload<Input, Context>,
  next: ModuleMiddlewareNext<Input, Output, Context>,
) => ProcedureOutput<Output>;

export type ModuleMiddlewareNext<Input, Output, Context> = (
  payload: ProcedurePayload<Input, Context>,
) => ProcedureOutput<Output>;

class ModuleProcedureFactory<
  Context,
  Type extends ProcedureType,
  Input,
  Output,
> {
  constructor(
    private _type: Type,
    private _middleware: ModuleMiddleware<Input, Output, Context>,
  ) {}

  input<NewInput>() {
    return new ModuleProcedureFactory<Context, Type, NewInput, Output>(
      this._type,
      this._middleware as unknown as ModuleMiddleware<
        NewInput,
        Output,
        Context
      >,
    );
  }

  type<NewType extends ProcedureType>(newType: NewType) {
    return new ModuleProcedureFactory<Context, NewType, Input, Output>(
      newType,
      this._middleware,
    );
  }

  output<NewOutput>() {
    return new ModuleProcedureFactory<Context, Type, Input, NewOutput>(
      this._type,
      this._middleware as unknown as ModuleMiddleware<
        Input,
        NewOutput,
        Context
      >,
    );
  }

  create(
    ...[handler]: OptionalHandlerWhen<
      ProcedureHandler<ProcedurePayload<Input, Context>, Output>,
      isVoidOrUndefined<Output>
    >
  ): ProcedureDefinition<Type, ProcedurePayload<Input, Context>, Output> {
    const next: ModuleMiddlewareNext<Input, Output, Context> =
      handler ?? (noop as never);
    return {
      type: this._type,
      handler: (payload) =>
        this._middleware(payload as ProcedurePayload<Input, Context>, next),
    };
  }
}

type OptionalHandlerWhen<
  Param,
  Condition extends boolean,
> = Condition extends true ? [handler?: Param] : [handler: Param];

const noop = () => {};

const passThroughMiddleware = <Input, Output, Context>(
  payload: ProcedurePayload<Input, Context>,
  next: ModuleMiddlewareNext<Input, Output, Context>,
) => next(payload);
