import type { ReadonlySignal } from "@mp/state";
import { useSignal } from "@mp/state/solid";
import { createQuery } from "@tanstack/solid-query";
import { createEffect } from "solid-js";

/**
 * Wrapper around createQuery that exposes data as an @mp/state Signal.
 * Uses simplified types - pass options as a function returning query config.
 */
export function useQuerySignal<TData>(
  // oxlint-disable-next-line no-explicit-any -- Simplified TanStack Query options typing
  options: () => any,
): { signal: ReadonlySignal<TData | undefined> } & Record<string, unknown> {
  const result = createQuery(options);
  const dataSignal = useSignal<TData | undefined>(result.data as TData);

  createEffect(() => {
    dataSignal.set(result.data as TData);
  });

  return {
    ...result,
    signal: dataSignal,
  };
}
