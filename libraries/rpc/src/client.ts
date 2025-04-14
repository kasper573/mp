// export function createTRPCSolidClient<TRouter extends AnyTRPCRouter>({
//   createMutationHandler,
//   createRequestContext,
//   ...clientOptions
// }: TRPCSolidClientOptions<TRouter>): TRPCSolidClient<TRouter> {
//   const client = createTRPCClient(clientOptions);
//   const proxy = createInvocationProxy((path) => {
//     const last = path.at(-1);
//     switch (last) {
//       case createQueryProperty:
//         return createTRPCQueryFn(
//           client,
//           path.slice(0, -1),
//           createRequestContext,
//         ) as AnyFunction;
//       case createMutationProperty:
//         return createTRPCMutationFn(
//           client,
//           path.slice(0, -1),
//           createMutationHandler,
//           createRequestContext,
//         ) as AnyFunction;
//       default:
//         // Safe to assume that the path represents a function,
//         // since the invocation proxy only resolves on invocations.
//         return getPropAt(client, path) as () => unknown;
//     }
//   });

//   return proxy as TRPCSolidClient<TRouter>;
// }

// function createTRPCQueryFn<TRouter extends AnyTRPCRouter>(
//   trpc: CreateTRPCClient<TRouter>,
//   path: string[],
//   createRequestContext: RequestContextFactory | undefined,
// ): CreateQueryFn<AnyProcedure> {
//   return (createOptions) => {
//     const context = createRequestContext?.();
//     return useQuery(() => {
//       const options = createOptions?.();
//       async function queryFn() {
//         const query = getPropAt(trpc, [...path, "query"]) as AnyFunction;
//         const result = await query(options?.input, { context });
//         if (options?.map) {
//           return options.map(result, options.input);
//         }
//         return result;
//       }
//       return {
//         queryKey: [...path, options?.input],
//         queryFn: options?.input === skipToken ? skipToken : queryFn,
//         ...options,
//       };
//     });
//   };
// }

// function createTRPCMutationFn<TRouter extends AnyTRPCRouter>(
//   trpc: CreateTRPCClient<TRouter>,
//   path: string[],
//   createMutationHandler: MutationHandlerFactory | undefined,
//   createRequestContext: RequestContextFactory | undefined,
// ): CreateMutationFn<AnyProcedure> {
//   return (createOptions) => {
//     const onMutation = createMutationHandler?.();
//     const context = createRequestContext?.();
//     return useMutation(() => {
//       async function mutationFn(input: unknown) {
//         const mutate = getPropAt(trpc, [...path, "mutate"]) as AnyFunction;
//         const output = await mutate(input, { context });
//         const { map, meta } = createOptions?.() ?? {};
//         await onMutation?.({ input, output, meta });
//         return map ? map(output, input) : output;
//       }
//       return {
//         ...createOptions?.(),
//         mutationKey: path,
//         mutationFn,
//       } as never;
//     });
//   };
// }

// export function createTRPCHook<
//   TRouter extends AnyTRPCRouter,
// >(): TRPCSolidClientHook<TRouter> {
//   return function useRPC() {
//     const clientLike = useContext(TRPCClientContext);
//     return clientLike as TRPCSolidClient<TRouter>;
//   };
// }

export const foo = 123;

// export const TRPCClientContext = createContext(
//   new Proxy({} as TRPCSolidClientLike, {
//     get() {
//       throw new Error("TRPCClientContext must be provided");
//     },
//   }),
// );

const clientSymbol = Symbol("TRPCClient");

// export interface TRPCSolidClientLike {
//   [clientSymbol]: true;
// }

// export interface TRPCSolidClientOptions<TRouter extends AnyTRPCRouter>
//   extends CreateTRPCClientOptions<TRouter> {
//   createMutationHandler?: MutationHandlerFactory;
//   createRequestContext?: RequestContextFactory;
// }

// export type RequestContextFactory = () => unknown;

// export type MutationHandlerFactory = () => (opt: {
//   input: unknown;
//   output: unknown;
//   meta: MutationOptions["meta"];
// }) => unknown;

// export type TRPCSolidClient<TRouter extends AnyTRPCRouter> =
//   TRPCSolidClientLike & CreateTRPCSolidClient<TRouter>;

// export type TRPCSolidClientHook<TRouter extends AnyTRPCRouter> =
//   () => TRPCSolidClient<TRouter>;

// type CreateTRPCSolidClient<TRouter extends AnyTRPCRouter> = RouterHooks<
//   TRouter["_def"]["record"]
// >;

// type RouterHooks<Routes> = {
//   [K in keyof Routes]: Routes[K] extends AnyProcedure
//     ? ProcedureHooks<Routes[K]>
//     : RouterHooks<Routes[K]>;
// };

// const createQueryProperty = "createQuery";
// const createMutationProperty = "createMutation";

// type ProcedureHooks<Proc extends AnyProcedure> =
//   Proc["_def"]["type"] extends "query"
//     ? { [createQueryProperty]: CreateQueryFn<Proc> }
//     : Proc["_def"]["type"] extends "mutation"
//       ? { [createMutationProperty]: CreateMutationFn<Proc> }
//       : never;

// type CreateQueryFn<Proc extends AnyProcedure> = <
//   MappedType = inferProcedureOutput<Proc>,
// >(
//   options?: () => TRPCQueryOptions<Proc, MappedType>,
// ) => UseQueryResult<MappedType, DefaultError>;

// type CreateMutationFn<Proc extends AnyProcedure> = <
//   MappedType = inferProcedureOutput<Proc>,
// >(
//   options?: () => TRPCMutationOptions<Proc, MappedType>,
// ) => UseMutationResult<MappedType, DefaultError, inferProcedureInput<Proc>>;

// type TRPCQueryOptions<Proc extends AnyProcedure, MappedType> = Omit<
//   SolidQueryOptions<
//     inferProcedureOutput<Proc>,
//     DefaultError,
//     inferProcedureInput<Proc>
//   >,
//   "queryKey"
// > &
//   WithInput<Proc> &
//   WithMapFn<Proc, MappedType>;

// type TRPCMutationOptions<
//   Proc extends AnyProcedure,
//   MappedType,
// > = SolidMutationOptions<
//   inferProcedureOutput<Proc>,
//   DefaultError,
//   inferProcedureInput<Proc>
// > &
//   WithMapFn<Proc, MappedType>;

// type WithInput<Proc extends AnyProcedure> =
//   IsRequired<inferProcedureInput<Proc>> extends true
//     ? InputProps<Proc>
//     : Partial<InputProps<Proc>>;

// interface InputProps<Proc extends AnyProcedure> {
//   input: inferProcedureInput<Proc> | SkipToken;
// }

// interface WithMapFn<Proc extends AnyProcedure, MappedType> {
//   map?: (
//     output: inferProcedureOutput<Proc>,
//     input: inferProcedureInput<Proc>,
//   ) => Promise<MappedType> | MappedType;
// }

// type IsRequired<T> = [T] extends [undefined | void] ? false : true;
