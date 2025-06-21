import type { AuthClientMiddleware } from "@mp/auth/client";
import type { Accessor } from "solid-js";
import type { RpcClient } from "./rpc";

export function gameAuthMiddleware(
  rpc: Accessor<RpcClient>,
): AuthClientMiddleware {
  return async (newIdentity, prevIdentity) => {
    if (newIdentity?.token) {
      await rpc().world.auth(newIdentity.token);
    } else if (prevIdentity?.token) {
      await rpc().world.removeAuth(prevIdentity.token);
    }
    return newIdentity;
  };
}
