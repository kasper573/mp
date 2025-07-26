// This is the file that represents what the @mp/api/sdk package exports.
// This module should only ever export the trpc client sdk.
import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { ApiRpcRouter } from "./router";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AccessToken } from "@mp/auth";
import { transformer } from "./transformer";

export const {
  TRPCProvider: ApiProvider,
  useTRPC: useApi,
  useTRPCClient: useApiClient,
} = createTRPCContext<ApiRpcRouter>();

export function createApiClient(
  url: string,
  getAccessToken?: () => AccessToken | undefined,
) {
  return createTRPCClient<ApiRpcRouter>({
    links: [
      httpBatchLink({
        transformer,
        url,
        headers() {
          const token = getAccessToken?.();
          return {
            Authorization: token ? `Bearer ${token}` : undefined,
          };
        },
      }),
    ],
  });
}
