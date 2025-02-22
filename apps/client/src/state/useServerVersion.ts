import { createMemo } from "npm:solid-js";
import { useTRPC } from "../integrations/trpc.ts";
import { env } from "../env.ts";

export const useVersionCompatibility = () => {
  const trpc = useTRPC();
  const serverVersion = trpc.system.buildVersion.createQuery();
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
