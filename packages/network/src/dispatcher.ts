export function createDispatcher<OutgoingProcedures extends AnyProcedures>(
  call: CallFn<OutgoingProcedures>,
): Dispatcher<OutgoingProcedures> {
  return new Proxy({} as Dispatcher<OutgoingProcedures>, {
    get(_, propertyName: string) {
      async function procedure(
        ...args: Parameters<OutgoingProcedures[keyof OutgoingProcedures]>
      ) {
        return call(propertyName, ...args);
      }

      return procedure;
    },
  });
}

export type ProcedureError = string;

export type ProcedureOutput<T> = Promise<T> | T;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProcedures = { [K: string]: ProcedureDefinition<any[], any> };

type ProcedureDefinition<Args extends unknown[], Output> = (
  ...args: Args
) => ProcedureOutput<Output>;

export type Dispatcher<OutgoingProcedures extends AnyProcedures> = {
  [ProcedureName in keyof OutgoingProcedures]: RPC<
    OutgoingProcedures[ProcedureName]
  >;
};

type RPC<Definition> =
  Definition extends ProcedureDefinition<infer Args, infer Output>
    ? (...args: Args) => Promise<Awaited<Output>>
    : never;

export type CallFn<Procedures extends AnyProcedures = AnyProcedures> = <
  ProcedureName extends keyof Procedures,
>(
  procedureName: ProcedureName,
  ...args: Parameters<Procedures[ProcedureName]>
) => Promise<ReturnType<Procedures[ProcedureName]>>;
