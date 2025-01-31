import { createQuery } from "@tanstack/solid-query";
import type { Accessor } from "solid-js";
import { trpc } from "../integrations/trpc";

export const useToggleServerTick = (): [
  Accessor<boolean>,
  (value: boolean) => unknown,
] => {
  const query = createQuery(() => ({
    queryKey: ["server-tick-enabled"],
    queryFn: () => trpc.system.isTickEnabled.query(),
  }));

  return [
    () => query.data ?? false,
    (enabled) => trpc.system.setTickEnabled.mutate(enabled),
  ] as const;
};
