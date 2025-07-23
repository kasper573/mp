import { useRpc } from "../integrations/rpc";
import { env } from "../env";

export const useVersionCompatibility = () => {
  const rpc = useRpc();
  const serverVersion = rpc.buildVersion.useQuery();
  if (serverVersion.data) {
    return env.version === serverVersion.data ? "compatible" : "incompatible";
  }
  return "indeterminate";
};
