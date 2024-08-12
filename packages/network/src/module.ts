/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Dispatcher, ProcedureOutput } from "./dispatcher";
import { createDispatcher } from "./dispatcher";

export function createModule<Procedures extends AnyProcedureRecord>(
  procedures: Procedures,
): Module<Procedures> {
  const procedureHandlers = new Map<
    keyof Procedures,
    Set<AnyProcedureHandler>
  >();

  // A module is essentially just a dispatcher
  const dispatcher = createDispatcher(
    async (...[procedureName, procedurePayload]) => {
      let outputForBuiltInHandler;

      const handlersForProcedure = procedureHandlers.get(procedureName);
      if (handlersForProcedure) {
        Array.from(handlersForProcedure).map((handler) => {
          const output = handler(procedurePayload);
          if (handler === procedures[procedureName].handler) {
            outputForBuiltInHandler = output;
          }
        });
      }

      return outputForBuiltInHandler as never;
    },
    (procedureName, handler) => {
      let handlers = procedureHandlers.get(procedureName);
      if (!handlers) {
        handlers = new Set();
        procedureHandlers.set(procedureName, handlers);
      }
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  );

  // But with predefined procedure handlers
  Object.entries(procedures).forEach(([name, { handler }]) =>
    dispatcher[name].subscribe(handler),
  );

  return new Proxy(dispatcher as Module<Procedures>, {
    get(target, prop) {
      // It has the ability to inspect the type of an procedure
      if (prop === procedureTypeGetter) {
        return (procedureName: keyof Procedures) =>
          procedures[procedureName].type;
      } else {
        // And everything else a dispatcher can do
        return target[prop];
      }
    },
  });
}

const procedureTypeGetter = "$getProcedureType" as const;

export type Module<Procedures extends AnyProcedureRecord = AnyProcedureRecord> =
  Dispatcher<ModuleProcedures<Procedures>, ModuleProcedures<Procedures>> & {
    [procedureTypeGetter](procedureName: keyof Procedures): ProcedureType;
  };

export type ModuleRecord<Procedures extends AnyModuleDefinitionRecord> = {
  [K in keyof Procedures]: Module<Procedures[K]>;
};

export type inferModuleDefinitions<T> =
  T extends ModuleRecord<infer Definitions> ? Definitions : never;

export type AnyModuleDefinitionRecord = Record<PropertyKey, AnyProcedureRecord>;

export type AnyProcedureRecord<
  Payload extends ProcedurePayload = ProcedurePayload,
> = {
  [K: PropertyKey]: AnyProcedureDefinition<Payload>;
};

export type AnyProcedureDefinition<
  Payload extends ProcedurePayload = ProcedurePayload,
> = ProcedureDefinition<ProcedureType, Payload, any>;

export interface ProcedurePayload<Input = any, Context = any> {
  input: Input;
  context: Context;
}

export type ProcedureType = "client-to-server" | "server-only";

export type ProcedureDefinition<
  Type extends ProcedureType,
  Payload extends ProcedurePayload,
  Output,
> = {
  type: Type;
  handler: ProcedureHandler<Payload, Output>;
};

export type AnyProcedureHandler = ProcedureHandler<any, any>;

export type ProcedureHandler<Payload extends ProcedurePayload, Output> = (
  payload: MakeInputOptional<Payload>,
) => ProcedureOutput<Output>;

export type ModuleProcedures<Procedures extends AnyProcedureRecord> = {
  [ProcedureName in keyof Procedures]: Procedures[ProcedureName]["handler"];
};

type MakeInputOptional<Payload extends ProcedurePayload> =
  isVoidOrUndefined<Payload["input"]> extends true
    ? {
        input?: Payload["input"];
        context: Payload["context"];
      }
    : Payload;

export type isVoidOrUndefined<T> = T extends void | undefined ? true : false;
