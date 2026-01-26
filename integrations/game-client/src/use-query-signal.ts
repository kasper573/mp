import type { ReadonlySignal } from "@mp/state";
import { signal } from "@mp/state";
import { createQuery } from "@tanstack/solid-query";
import { createEffect, createMemo } from "solid-js";

// Using any to avoid complex TanStack Query type issues
// oxlint-disable-next-line no-explicit-any
export function useQuerySignal<TData = unknown>(
  // oxlint-disable-next-line no-explicit-any
  options: () => any,
): {
  signal: ReadonlySignal<TData | undefined>;
  isLoading: boolean;
  isError: boolean;
  // oxlint-disable-next-line no-explicit-any
  error: any;
} {
  const result = createQuery(options);
  const dataSignal = signal<TData | undefined>(
    result.data as TData | undefined,
  );

  createEffect(() => {
    dataSignal.set(result.data as TData | undefined);
  });

  const combined = createMemo(() => ({
    signal: dataSignal,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
  }));

  return combined();
}
