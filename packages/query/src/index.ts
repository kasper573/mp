import * as tanstack from "@tanstack/react-query";
import { useSignal } from "@mp/state/react";
import type { ReadonlySignal } from "@mp/state";
import { useEffect, useMemo } from "preact/hooks";

export {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useSuspenseQuery,
  useMutation,
  skipToken,
  type SkipToken,
  type UseMutationResult,
  type UseQueryResult,
  type UseSuspenseQueryResult,
  type UseQueryOptions,
  type DefaultError,
} from "@tanstack/react-query";

export function useQuerySignal<
  TQueryFnData = unknown,
  TError = tanstack.DefaultError,
  TData = TQueryFnData,
  TQueryKey extends tanstack.QueryKey = tanstack.QueryKey,
>(
  options: tanstack.UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): Omit<tanstack.UseQueryResult<TData, TError>, "data"> & {
  signal: ReadonlySignal<TData | undefined>;
} {
  const result = tanstack.useQuery(options);
  const dataSignal = useSignal(result.data);
  useEffect(() => {
    dataSignal.value = result.data;
  }, [result.data, dataSignal]);
  return useMemo(
    () => ({
      ...result,
      signal: dataSignal,
    }),
    [result, dataSignal],
  );
}

export { ReactQueryDevtools } from "@tanstack/react-query-devtools";
