import type { RootRouter } from "@mp/server";
import { transformer } from "@mp-modules/trpc";

import {
  createTRPCSolidClient,
  httpBatchLink,
  createTRPCHook,
} from "@mp/solid-trpc";
import { useContext } from "solid-js";
import { AuthContext } from "@mp/auth/client";
import { env } from "../env";

export function createTRPCClient() {
  return createTRPCSolidClient<RootRouter>({
    links: [
      httpBatchLink({
        url: env.apiUrl,
        transformer,
        headers({ opList: [{ context }] }) {
          const { identity } = context as RequestContext;
          const token = identity()?.token;
          return {
            Authorization: token ? `Bearer ${token}` : undefined,
          };
        },
      }),
    ],
    createRequestContext,
  });
}

export const useTRPC = createTRPCHook<RootRouter>();

type RequestContext = ReturnType<typeof createRequestContext>;

function createRequestContext() {
  const { identity } = useContext(AuthContext);
  return { identity };
}
