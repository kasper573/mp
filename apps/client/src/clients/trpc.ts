import type { RootRouter } from "@mp/server";
import { transformer, tokenHeaderName } from "@mp/server";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AuthClient } from "@mp/auth-client";
import { env } from "../env.ts";
import { rootLogger } from "../logger.ts";

let authClient: AuthClient | undefined;

const logger = rootLogger.chain("trpc");

export const trpc = createTRPCClient<RootRouter>({
  links: [
    httpBatchLink({
      url: env.apiUrl,
      transformer,
      async headers() {
        if (!authClient) {
          throw new Error("An auth client instance must be given to trpc");
        }
        await authClient.refresh(); // Ensure we have the latest user identity
        return { [tokenHeaderName]: authClient.identity()?.token ?? "" };
      },
      fetch: async (...args) => {
        const result = await fetch(...args);
        if (authClient?.isSignedIn() && result.status === 401) {
          logger.info(
            "Automatically signed out due to 401 response from server"
          );
          void authClient?.signOut();
        }
        return result;
      },
    }),
  ],
});

export function giveAuthClientToTRPC(client: AuthClient) {
  authClient = client;
}
