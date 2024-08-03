export function createProcedureBus<
  OutgoingProcedures extends AnyProcedures,
  IncomingProcedures extends AnyProcedures,
>(
  call: EmitFn<OutgoingProcedures>,
  subscribe = noop as SubscribeFn<IncomingProcedures>,
): ProcedureBus<OutgoingProcedures, IncomingProcedures> {
  return new Proxy({} as ProcedureBus<OutgoingProcedures, IncomingProcedures>, {
    get(_, propertyName: string) {
      function procedure(
        ...args: Parameters<OutgoingProcedures[keyof OutgoingProcedures]>
      ): ProcedureOutput<
        ReturnType<OutgoingProcedures[keyof OutgoingProcedures]>
      > {
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
type AnyProcedures = { [K: string]: (...args: any[]) => ProcedureOutput<any> };

export type ProcedureBus<
  OutgoingProcedures extends AnyProcedures,
  IncomingProcedures extends AnyProcedures,
> = {
  [ProcedureName in keyof OutgoingProcedures]: OutgoingProcedures[ProcedureName];
} & {
  [ProcedureName in keyof IncomingProcedures]: {
    subscribe(handler: IncomingProcedures[ProcedureName]): Unsubscribe;
  };
};

export type EmitFn<Procedures extends AnyProcedures = AnyProcedures> = <
  ProcedureName extends keyof Procedures,
>(
  procedureName: ProcedureName,
  ...args: Parameters<Procedures[ProcedureName]>
) => ProcedureOutput<ReturnType<Procedures[ProcedureName]>>;

export type SubscribeFn<Procedures extends AnyProcedures = AnyProcedures> = <
  ProcedureName extends keyof Procedures,
>(
  procedureName: ProcedureName,
  handler: Procedures[ProcedureName],
) => Unsubscribe;

const noop = () => () => {};

export type Unsubscribe = () => void;
