import { createQuery } from "@tanstack/solid-query";
import { createMemo } from "solid-js";
import { trpc } from "../integrations/trpc";
import { env } from "../env";

export const useServerVersion = () =>
  createQuery(() => ({
    queryKey: ["server-version"],
    queryFn: () => trpc.system.buildVersion.query(),
  }));

export const useVersionCompatibility = () => {
  const serverVersion = useServerVersion();
  const compatibility = createMemo(() => {
    if (serverVersion.status === "success") {
      return env.buildVersion === serverVersion.data
        ? "compatible"
        : "incompatible";
    }
    return "indeterminate";
  });

  return compatibility;
};
