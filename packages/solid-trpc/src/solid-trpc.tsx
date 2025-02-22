import type { DefaultError, MutationOptions } from "npm:@tanstack/solid-query";
import {
  createMutation,
  type CreateMutationResult,
  createQuery,
  type CreateQueryResult,
  type SkipToken,
  skipToken,
  type SolidMutationOptions,
  type SolidQueryOptions,
} from "npm:@tanstack/solid-query";
import type {
  CreateTRPCClientOptions,
  CreateTRPCProxyClient,
} from "npm:@trpc/client";
import { createTRPCProxyClient } from "npm:@trpc/client";
import type {
  AnyProcedure,
  AnyRouter,
  inferProcedureInput,
  inferProcedureOutput,
} from "npm:@trpc/server";
import { createContext, useContext } from "npm:solid-js";
import type { AnyFunction } from "./invocation-proxy.ts";
import { createInvocationProxy, getPropAt } from "./invocation-proxy.ts";

export function createTRPCSolidClient<TRouter extends AnyRouter>({
  createMutationHandler: onMutation,
  ...clientOptions
}: TRPCSolidClientOptions<TRouter>): TRPCSolidClient<TRouter> {
  const client = createTRPCProxyClient(
    clientOptions as CreateTRPCClientOptions<TRouter>,
  );
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

function createTRPCQueryFn<TRouter extends AnyRouter>(
  trpc: CreateTRPCProxyClient<TRouter>,
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

function createTRPCMutationFn<TRouter extends AnyRouter>(
  trpc: CreateTRPCProxyClient<TRouter>,
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
  TRouter extends AnyRouter,
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

export type TRPCSolidClientOptions<TRouter extends AnyRouter> =
  & CreateTRPCClientOptions<TRouter>
  & {
    createMutationHandler?: CreateMutationHandler;
  };

export type CreateMutationHandler = () => (opt: {
  input: unknown;
  output: unknown;
  meta: MutationOptions["meta"];
}) => unknown;

export type TRPCSolidClient<TRouter extends AnyRouter> =
  & TRPCSolidClientLike
  & CreateTRPCSolidClient<TRouter>;

export type TRPCSolidClientHook<TRouter extends AnyRouter> = () =>
  TRPCSolidClient<TRouter>;

type CreateTRPCSolidClient<TRouter extends AnyRouter> = RouterHooks<
  TRouter["_def"]["record"]
>;

type RouterHooks<Routes> = {
  [K in keyof Routes]: Routes[K] extends AnyProcedure
    ? ProcedureHooks<Routes[K]>
    : RouterHooks<Routes[K]>;
};

const createQueryProperty = "createQuery";
const createMutationProperty = "createMutation";

type ProcedureHooks<Proc extends AnyProcedure> = Proc["_type"] extends "query"
  ? { [createQueryProperty]: CreateQueryFn<Proc> }
  : Proc["_type"] extends "mutation"
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

type TRPCQueryOptions<Proc extends AnyProcedure, MappedType> =
  & Omit<
    SolidQueryOptions<
      inferProcedureOutput<Proc>,
      DefaultError,
      inferProcedureInput<Proc>
    >,
    "queryKey"
  >
  & WithInput<Proc>
  & WithMapFn<Proc, MappedType>;

type TRPCMutationOptions<
  Proc extends AnyProcedure,
  MappedType,
> =
  & SolidMutationOptions<
    inferProcedureOutput<Proc>,
    DefaultError,
    inferProcedureInput<Proc>
  >
  & WithMapFn<Proc, MappedType>;

type WithInput<Proc extends AnyProcedure> =
  IsRequired<inferProcedureInput<Proc>> extends true ? InputProps<Proc>
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
