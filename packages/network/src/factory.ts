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

  procedure = new ModuleProcedureFactory<
    Context,
    "client-to-server",
    void,
    void
  >("client-to-server");
}

class ModuleProcedureFactory<
  Context,
  Type extends ProcedureType,
  Input,
  Output,
> {
  constructor(private _type: Type) {}

  input<NewInput>() {
    return new ModuleProcedureFactory<Context, Type, NewInput, Output>(
      this._type,
    );
  }

  type<NewType extends ProcedureType>(newType: NewType) {
    return new ModuleProcedureFactory<Context, NewType, Input, Output>(newType);
  }

  output<NewOutput>() {
    return new ModuleProcedureFactory<Context, Type, Input, NewOutput>(
      this._type,
    );
  }

  create(
    ...[handler]: OptionalHandlerWhen<
      ProcedureHandler<ProcedurePayload<Input, Context>, Output>,
      isVoidOrUndefined<Output>
    >
  ): ProcedureDefinition<Type, ProcedurePayload<Input, Context>, Output> {
    return { type: this._type, handler: handler ?? (noop as never) };
  }
}

type OptionalHandlerWhen<
  Param,
  Condition extends boolean,
> = Condition extends true ? [handler?: Param] : [handler: Param];

const noop = () => {};
