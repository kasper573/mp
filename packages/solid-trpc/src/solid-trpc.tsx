import type { DefaultError, MutationOptions } from "@tanstack/solid-query";
import {
  createMutation,
  createQuery,
  skipToken,
  type CreateMutationResult,
  type CreateQueryResult,
  type SkipToken,
  type SolidMutationOptions,
  type SolidQueryOptions,
} from "@tanstack/solid-query";
import type { CreateTRPCClient, CreateTRPCClientOptions } from "@trpc/client";
import { createTRPCClient } from "@trpc/client";
import type {
  AnyTRPCRouter,
  AnyProcedure,
  inferProcedureInput,
  inferProcedureOutput,
} from "@trpc/server";
import { createContext, useContext } from "solid-js";
import type { AnyFunction } from "./invocation-proxy";
import { createInvocationProxy, getPropAt } from "./invocation-proxy";

export function createTRPCSolidClient<TRouter extends AnyTRPCRouter>({
  createMutationHandler: onMutation,
  ...clientOptions
}: TRPCSolidClientOptions<TRouter>): TRPCSolidClient<TRouter> {
  const client = createTRPCClient(clientOptions);
  const proxy = createInvocationProxy((path) => {
    const last = path.at(-1);
    switch (last) {
      case createQueryProperty:
        return createTRPCQueryFn(client, path.slice(0, -1)) as AnyFunction;
      case createMutationProperty:
        return createTRPCMutationFn(
          client,
          path.slice(0, -1),
          onMutation,
        ) as AnyFunction;
      default:
        // Safe to assume that the path represents a function,
        // since the invocation proxy only resolves on invocations.
        return getPropAt(client, path) as () => unknown;
    }
  });

  return proxy as TRPCSolidClient<TRouter>;
}

function createTRPCQueryFn<TRouter extends AnyTRPCRouter>(
  trpc: CreateTRPCClient<TRouter>,
  path: string[],
): CreateQueryFn<AnyProcedure> {
  return (createOptions) =>
    createQuery(() => {
      const options = createOptions?.();
      async function queryFn() {
        const query = getPropAt(trpc, [...path, "query"]) as AnyFunction;
        const result = await query(options?.input);
        if (options?.map) {
          return options.map(result, options.input);
        }
        return result;
      }
      return {
        queryKey: [...path, options?.input],
        queryFn: options?.input === skipToken ? skipToken : queryFn,
        ...options,
      };
    });
}

function createTRPCMutationFn<TRouter extends AnyTRPCRouter>(
  trpc: CreateTRPCClient<TRouter>,
  path: string[],
  createMutationHandler?: CreateMutationHandler,
): CreateMutationFn<AnyProcedure> {
  return (createOptions) => {
    const onMutation = createMutationHandler?.();
    return createMutation(() => {
      async function mutationFn(input: unknown) {
        const mutate = getPropAt(trpc, [...path, "mutate"]) as AnyFunction;
        const output = await mutate(input);
        const { map, meta } = createOptions?.() ?? {};
        await onMutation?.({ input, output, meta });
        return map ? map(output, input) : output;
      }
      return {
        ...createOptions?.(),
        mutationKey: path,
        mutationFn,
      } as never;
    });
  };
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
  createMutationHandler?: CreateMutationHandler;
}

export type CreateMutationHandler = () => (opt: {
  input: unknown;
  output: unknown;
  meta: MutationOptions["meta"];
}) => unknown;

export type TRPCSolidClient<TRouter extends AnyTRPCRouter> =
  TRPCSolidClientLike & CreateTRPCSolidClient<TRouter>;

export type TRPCSolidClientHook<TRouter extends AnyTRPCRouter> =
  () => TRPCSolidClient<TRouter>;

type CreateTRPCSolidClient<TRouter extends AnyTRPCRouter> = RouterHooks<
  TRouter["_def"]["record"]
>;

type RouterHooks<Routes> = {
  [K in keyof Routes]: Routes[K] extends AnyProcedure
    ? ProcedureHooks<Routes[K]>
    : RouterHooks<Routes[K]>;
};

const createQueryProperty = "use";
const createMutationProperty = "use";

type ProcedureHooks<Proc extends AnyProcedure> =
  Proc["_def"]["type"] extends "query"
    ? { [createQueryProperty]: CreateQueryFn<Proc> }
    : Proc["_def"]["type"] extends "mutation"
      ? { [createMutationProperty]: CreateMutationFn<Proc> }
      : never;

type CreateQueryFn<Proc extends AnyProcedure> = <
  MappedType = inferProcedureOutput<Proc>,
>(
  options?: () => TRPCQueryOptions<Proc, MappedType>,
) => CreateQueryResult<MappedType, DefaultError>;

type CreateMutationFn<Proc extends AnyProcedure> = <
  MappedType = inferProcedureOutput<Proc>,
>(
  options?: () => TRPCMutationOptions<Proc, MappedType>,
) => CreateMutationResult<MappedType, DefaultError, inferProcedureInput<Proc>>;

type TRPCQueryOptions<Proc extends AnyProcedure, MappedType> = Omit<
  SolidQueryOptions<
    inferProcedureOutput<Proc>,
    DefaultError,
    inferProcedureInput<Proc>
  >,
  "queryKey"
> &
  WithInput<Proc> &
  WithMapFn<Proc, MappedType>;

type TRPCMutationOptions<
  Proc extends AnyProcedure,
  MappedType,
> = SolidMutationOptions<
  inferProcedureOutput<Proc>,
  DefaultError,
  inferProcedureInput<Proc>
> &
  WithMapFn<Proc, MappedType>;

type WithInput<Proc extends AnyProcedure> =
  IsRequired<inferProcedureInput<Proc>> extends true
    ? InputProps<Proc>
    : Partial<InputProps<Proc>>;

interface InputProps<Proc extends AnyProcedure> {
  input: inferProcedureInput<Proc> | SkipToken;
}

interface WithMapFn<Proc extends AnyProcedure, MappedType> {
  map?: (
    output: inferProcedureOutput<Proc>,
    input: inferProcedureInput<Proc>,
  ) => Promise<MappedType> | MappedType;
}

type IsRequired<T> = [T] extends [undefined | void] ? false : true;
