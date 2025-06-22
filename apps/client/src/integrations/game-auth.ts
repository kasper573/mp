import type { AuthClientMiddleware } from "@mp/auth/client";
import type { Accessor } from "solid-js";
import type { RpcClient } from "./rpc";

/**
 * The auth client by default only authenticates with Keycloak.
 * However, before using the game server you must also authenticate with the game server.
 * We want the auth clients local state to represent that we're authenticated with both.
 * This middleware ensures that we always synchronize the auth state with the game server
 * before the local auth store is updated.
 * This allows us to trust that when the auth client is signed in,
 * we are also allowed to use the game server.
 */
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
