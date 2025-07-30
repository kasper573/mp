import { useApi } from "@mp/api-service/sdk";
import { useQuery } from "@mp/query";
import { env } from "../env";

export const useVersionCompatibility = () => {
  const api = useApi();
  const serverVersion = useQuery(api.buildVersion.queryOptions());
  if (serverVersion.data) {
    return env.version === serverVersion.data ? "compatible" : "incompatible";
  }
  return "indeterminate";
};
