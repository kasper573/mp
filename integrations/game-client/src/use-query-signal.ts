import type { ReadonlySignal } from "@mp/state";
import { useSignal } from "@mp/state/react";
import {
  useQuery,
  type DefaultError,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useEffect, useMemo } from "preact/hooks";

export function useQuerySignal<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): Omit<UseQueryResult<TData, TError>, "data"> & {
  signal: ReadonlySignal<TData | undefined>;
} {
  const result = useQuery(options);
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
