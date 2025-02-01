import { createMemo } from "solid-js";
import { useTRPC } from "../integrations/trpc";
import { env } from "../env";

export const useVersionCompatibility = () => {
  const trpc = useTRPC();
  const serverVersion = trpc.system.buildVersion.use();
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
