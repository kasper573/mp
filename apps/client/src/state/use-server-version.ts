import { createMemo } from "solid-js";
import { useRPC } from "../integrations/rpc";
import { env } from "../env";

export const useVersionCompatibility = () => {
  const rpc = useRPC();
  const serverVersion = rpc.system.buildVersion.createQuery();
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
