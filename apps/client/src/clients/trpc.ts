import type { RootRouter } from "@mp/server";
import { transformer, tokenHeaderName } from "@mp/server";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { env } from "../env";
import { authClient, fetchAuthToken } from "./auth";

export const trpc = createTRPCClient<RootRouter>({
  links: [
    httpBatchLink({
      url: env.apiUrl,
      transformer,
      async headers() {
        return { [tokenHeaderName]: (await fetchAuthToken(authClient)) ?? "" };
      },
    }),
  ],
});
