import type { RootRouter } from "@mp/server";
import { transformer, tokenHeaderName } from "@mp/server";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AuthClient } from "@mp/auth/client";
import { env } from "../env";

let authClient: AuthClient | undefined;

export const trpc = createTRPCClient<RootRouter>({
  links: [
    httpBatchLink({
      url: env.apiUrl,
      transformer,
      async headers() {
        if (!authClient) {
          throw new Error("An auth client instance must be given to trpc");
        }
        const user = await authClient.refresh();
        return { [tokenHeaderName]: user?.token ?? "" };
      },
    }),
  ],
});

export function giveAuthClientToTRPC(client: AuthClient) {
  authClient = client;
}
