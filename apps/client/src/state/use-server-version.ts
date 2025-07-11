import { useRpc } from "../integrations/rpc";
import { env } from "../env";

export const useVersionCompatibility = () => {
  const rpc = useRpc();
  const serverVersion = rpc.system.buildVersion.useQuery();
  if (serverVersion.data) {
    return env.buildVersion === serverVersion.data
      ? "compatible"
      : "incompatible";
  }
  return "indeterminate";
};
