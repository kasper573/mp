import type { ReadonlySignal } from "@mp/state";
import { useSignal } from "@mp/state/solid";
import {
  createQuery,
  type SolidQueryOptions,
  type DefaultError,
  type QueryKey,
} from "@tanstack/solid-query";
import { createEffect, createMemo, type Accessor } from "solid-js";

export function useQuerySignal<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(options: () => SolidQueryOptions<TQueryFnData, TError, TData, TQueryKey>) {
  const result = createQuery(
    options as Accessor<
      SolidQueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
        initialData?: undefined;
      }
    >,
  );
  const dataSignal = useSignal<TData | undefined>(
    result.data as TData | undefined,
  );

  createEffect(() => {
    dataSignal.write(result.data as TData | undefined);
  });

  return createMemo(() => ({
    ...result,
    signal: dataSignal as ReadonlySignal<TData | undefined>,
  }))();
}
