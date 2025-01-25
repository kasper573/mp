import type { RootRouter } from "@mp/server";
import { transformer, tokenHeaderName } from "@mp/server";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { type AuthClient } from "@mp/auth-client";
import { env } from "../env";

let integrations: TRPCIntegrations | undefined;

// TODO refactor this to be a factory so it can be constructed in the composition root
export const trpc = createTRPCClient<RootRouter>({
  links: [
    httpBatchLink({
      url: env.apiUrl,
      transformer,
      async headers() {
        await integrations?.auth.refresh(); // Ensure we have the latest user identity
        return {
          [tokenHeaderName]: integrations?.auth?.identity()?.token ?? "",
        };
      },
    }),
  ],
});

export interface TRPCIntegrations {
  auth: AuthClient;
}

export function attachTrpcIntegrations(int: TRPCIntegrations) {
  integrations = int;
}
