import type {
  DefaultError,
  MutationOptions,
  UseMutationResult,
} from "@tanstack/solid-query";
import {
  skipToken,
  useMutation,
  useQueryClient,
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
import type { Accessor } from "solid-js";
import { createContext, createEffect, createMemo, useContext } from "solid-js";
import { createMutable } from "solid-js/store";
import type { AnyFunction } from "./invocation-proxy";
import { createInvocationProxy, getPropAt } from "./invocation-proxy";

export function createTRPCSolidClient<TRouter extends AnyTRPCRouter>({
  createMutationHandler,
  createRequestContext,
  ...clientOptions
}: TRPCSolidClientOptions<TRouter>): TRPCSolidClient<TRouter> {
  const client = createTRPCClient(clientOptions);
  const store = createMutable({} as QueryDataStore);
  const proxy = createInvocationProxy((path) => {
    const last = path.at(-1);
    switch (last) {
      case createQueryProperty:
        return createTRPCQueryFn(
          client,
          path.slice(0, -1),
          createRequestContext,
          store,
        ) as AnyFunction;
      case createMutationProperty:
        return createTRPCMutationFn(
          client,
          path.slice(0, -1),
          createMutationHandler,
          createRequestContext,
        ) as AnyFunction;
      default:
        // Safe to assume that the path represents a function,
        // since the invocation proxy only resolves on invocations.
        return getPropAt(client, path) as () => unknown;
    }
  });

  return proxy as TRPCSolidClient<TRouter>;
}

type QueryDataStore = Record<
  string,
  { isLoading: boolean; data: unknown; error: unknown }
>;

function createTRPCQueryFn<TRouter extends AnyTRPCRouter>(
  trpc: CreateTRPCClient<TRouter>,
  path: string[],
  createRequestContext: RequestContextFactory | undefined,
  store: QueryDataStore,
): CreateQueryFn<AnyProcedure> {
  const storeKey = path.join(".");
  return (createOptions) => {
    const context = createRequestContext?.();
    const client = useQueryClient();
    const data = createMemo(() => store[storeKey]?.data as never);
    const error = createMemo(() => store[storeKey]?.error);
    const isLoading = createMemo(() => store[storeKey]?.isLoading);
    const getInput = createMemo(() => createOptions?.().input as unknown);
    const enabled = createMemo(() => createOptions?.().enabled ?? true);

    // We don't use useQuery because we don't want to use suspense
    // (it uses createResource, which triggers suspense implicitly.
    // We want suspense to be an opt-in feature)
    createEffect(() => {
      const input = getInput();
      if (input === skipToken || !enabled()) {
        return;
      }

      void (async () => {
        try {
          store[storeKey] = {
            data: undefined,
            error: undefined,
            isLoading: true,
          };
          const res = await client.fetchQuery({
            queryKey: [storeKey],
            async queryFn() {
              const query = getPropAt(trpc, [...path, "query"]) as AnyFunction;
              const result = await query(input, { context });
              const { map } = createOptions?.() ?? {};
              if (map) {
                return map(result, input);
              }
              return result;
            },
          });
          store[storeKey].data = res;
        } catch (error) {
          store[storeKey].error = error;
        } finally {
          store[storeKey].isLoading = false;
        }
      })();
    });

    return {
      data,
      error,
      isLoading,
    };
  };
}

function createTRPCMutationFn<TRouter extends AnyTRPCRouter>(
  trpc: CreateTRPCClient<TRouter>,
  path: string[],
  createMutationHandler: MutationHandlerFactory | undefined,
  createRequestContext: RequestContextFactory | undefined,
): CreateMutationFn<AnyProcedure> {
  return (createOptions) => {
    const onMutation = createMutationHandler?.();
    const context = createRequestContext?.();
    return useMutation(() => {
      async function mutationFn(input: unknown) {
        const mutate = getPropAt(trpc, [...path, "mutate"]) as AnyFunction;
        const output = await mutate(input, { context });
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
  createMutationHandler?: MutationHandlerFactory;
  createRequestContext?: RequestContextFactory;
}

export type RequestContextFactory = () => unknown;

export type MutationHandlerFactory = () => (opt: {
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

const createQueryProperty = "createQuery";
const createMutationProperty = "createMutation";

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
) => {
  data: Accessor<MappedType | undefined>;
  error: Accessor<unknown>;
  isLoading: Accessor<boolean>;
};

type CreateMutationFn<Proc extends AnyProcedure> = <
  MappedType = inferProcedureOutput<Proc>,
>(
  options?: () => TRPCMutationOptions<Proc, MappedType>,
) => UseMutationResult<MappedType, DefaultError, inferProcedureInput<Proc>>;

type TRPCQueryOptions<Proc extends AnyProcedure, MappedType> = Pick<
  SolidQueryOptions<
    inferProcedureOutput<Proc>,
    DefaultError,
    inferProcedureInput<Proc>
  >,
  "meta" | "enabled"
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
