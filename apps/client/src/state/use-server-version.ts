import { createMemo } from "solid-js";
import { useTRPC } from "../integrations/trpc";
import { env } from "../env";

export const useVersionCompatibility = () => {
  const trpc = useTRPC();
  const serverVersion = trpc.system.buildVersion.createQuery();
  const compatibility = createMemo(() => {
    if (serverVersion.data()) {
      return env.buildVersion === serverVersion.data()
        ? "compatible"
        : "incompatible";
    }
    return "indeterminate";
  });

  return compatibility;
};
