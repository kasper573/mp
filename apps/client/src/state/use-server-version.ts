import { useQuery } from "@mp/query";
import { env } from "../env";
import { useApi } from "@mp/api/sdk";

export const useVersionCompatibility = () => {
  const api = useApi();
  const serverVersion = useQuery(api.buildVersion.queryOptions());
  if (serverVersion.data) {
    return env.version === serverVersion.data ? "compatible" : "incompatible";
  }
  return "indeterminate";
};
