import type {
  CreateMutationResult,
  CreateQueryResult,
  QueryClient,
  SkipToken,
  SolidMutationOptions,
  SolidQueryOptions,
} from "@tanstack/solid-query";
import type { CreateTRPCClient, CreateTRPCClientOptions } from "@trpc/client";
import { createTRPCClient } from "@trpc/client";
import type { AnyProcedure, AnyTRPCRouter } from "@trpc/server";
import type {
  inferProcedureInput,
  inferProcedureOutput,
  RouterRecord,
} from "@trpc/server/unstable-core-do-not-import";
import { createContext, useContext } from "solid-js";

export function createTRPCSolidClient<TRouter extends AnyTRPCRouter>({
  queryClient,
  ...clientOptions
}: TRPCSolidClientOptions<TRouter>): TRPCSolidClient<TRouter> {
  const client = createTRPCClient(clientOptions);

  return null as unknown as TRPCSolidClient<TRouter>;
}

export function createTRPCHook<
  TRouter extends AnyTRPCRouter,
>(): TRPCSolidClientHook<TRouter> {
  return function useTRPC() {
    const clientLike = useContext(TRPCClientContext);
    return clientLike as TRPCSolidClient<TRouter>;
  };
}

export const TRPCClientContext = createContext(
  new Proxy({} as TRPCSolidClientLike, {
    get() {
      throw new Error("TRPCClientContext must be provided");
    },
  }),
);

const clientSymbol = Symbol("TRPCClient");

export interface TRPCSolidClientLike {
  [clientSymbol]: true;
}

export interface TRPCSolidClientOptions<TRouter extends AnyTRPCRouter>
  extends CreateTRPCClientOptions<TRouter> {
  queryClient: QueryClient;
}

export type TRPCSolidClient<TRouter extends AnyTRPCRouter> =
  TRPCSolidClientLike & CreateTRPCSolidClient<TRouter>;

export type TRPCSolidClientHook<TRouter extends AnyTRPCRouter> =
  () => TRPCSolidClient<TRouter>;

type CreateTRPCSolidClient<TRouter extends AnyTRPCRouter> =
  CreateTRPCClient<TRouter> & RouterHooks<TRouter["_def"]["record"]>;

type RouterHooks<Routes extends RouterRecord> = {
  [K in keyof Routes]: Routes[K] extends RouterRecord
    ? RouterHooks<Routes[K]>
    : Routes[K] extends AnyProcedure
      ? ProcedureHooks<Routes[K]>
      : never;
};

type ProcedureHooks<Proc extends AnyProcedure> =
  Proc["_def"]["type"] extends "query"
    ? {
        createQuery: <MappedType = inferProcedureOutput<Proc>>(
          options?: () => CustomQueryOptions<Proc, MappedType>,
        ) => CreateQueryResult<MappedType>;
      }
    : Proc["_def"]["type"] extends "mutation"
      ? {
          createMutation: <MappedType = inferProcedureOutput<Proc>>(
            options?: () => CustomMutationOptions<Proc, MappedType>,
          ) => CreateMutationResult<MappedType>;
        }
      : never;

type CustomQueryOptions<Proc extends AnyProcedure, MappedType> = Omit<
  SolidQueryOptions<inferProcedureInput<Proc>>,
  "queryKey"
> &
  AdditionalOptions<Proc, MappedType>;

type CustomMutationOptions<
  Proc extends AnyProcedure,
  MappedType,
> = SolidMutationOptions<inferProcedureInput<Proc>> &
  AdditionalOptions<Proc, MappedType>;

type AdditionalOptions<
  Proc extends AnyProcedure,
  MappedType,
> = WithInput<Proc> & (WithMapFn<Proc, MappedType> | {});

interface WithInput<Proc extends AnyProcedure> {
  input: inferProcedureInput<Proc> | SkipToken;
}

interface WithMapFn<Proc extends AnyProcedure, MappedType> {
  map: (
    output: inferProcedureOutput<Proc>,
    input: inferProcedureInput<Proc>,
  ) => Promise<MappedType> | MappedType;
}
