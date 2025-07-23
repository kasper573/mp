// This is the file that represents what the @mp/api/sdk package exports.
// This module should only ever export the trpc client sdk.
import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { ApiRpcRouter } from "./router";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

export const {
  TRPCProvider: ApiProvider,
  useTRPC: useApi,
  useTRPCClient: useApiClient,
} = createTRPCContext<ApiRpcRouter>();

export function createApiClint() {
  return createTRPCClient<ApiRpcRouter>({
    links: [
      httpBatchLink({
        url: "http://localhost:2022",
      }),
    ],
  });
}
