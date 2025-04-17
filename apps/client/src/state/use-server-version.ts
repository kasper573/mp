import { createMemo } from "solid-js";
import { useRpc } from "../integrations/rpc";
import { env } from "../env";

export const useVersionCompatibility = () => {
  const rpc = useRpc();
  const serverVersion = rpc.system.buildVersion.createQuery();
  const compatibility = createMemo(() => {
    if (serverVersion.data) {
      return env.buildVersion === serverVersion.data
        ? "compatible"
        : "incompatible";
    }
    return "indeterminate";
  });

  return compatibility;
};
