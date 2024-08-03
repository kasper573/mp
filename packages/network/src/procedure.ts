export function createProcedureBus<
  OutgoingProcedures extends AnyProcedures,
  IncomingProcedures extends AnyProcedures,
>(
  call: CallFn<OutgoingProcedures>,
  subscribe = noop as SubscribeFn<IncomingProcedures>,
): ProcedureBus<OutgoingProcedures, IncomingProcedures> {
  return new Proxy({} as ProcedureBus<OutgoingProcedures, IncomingProcedures>, {
    get(_, propertyName: string) {
      function procedure(
        ...args: Parameters<OutgoingProcedures[keyof OutgoingProcedures]>
      ) {
        return call(propertyName, ...args);
      }

      procedure.subscribe = (
        handler: IncomingProcedures[keyof IncomingProcedures],
      ) => subscribe(propertyName, handler);

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

export type ProcedureBus<
  OutgoingProcedures extends AnyProcedures,
  IncomingProcedures extends AnyProcedures,
> = {
  [ProcedureName in keyof OutgoingProcedures]: RPC<
    OutgoingProcedures[ProcedureName]
  >;
} & {
  [ProcedureName in keyof IncomingProcedures]: {
    subscribe(handler: IncomingProcedures[ProcedureName]): Unsubscribe;
  };
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

export type SubscribeFn<Procedures extends AnyProcedures = AnyProcedures> = <
  ProcedureName extends keyof Procedures,
>(
  procedureName: ProcedureName,
  handler: Procedures[ProcedureName],
) => Unsubscribe;

const noop = () => () => {};

export type Unsubscribe = () => void;
