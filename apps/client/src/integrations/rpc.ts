import type { ServerRpcRouter } from "@mp/server";
import type { SolidRpcInvoker } from "@mp/rpc/solid";
import { createSolidRpcInvoker } from "@mp/rpc/solid";
import { createContext, createEffect, onCleanup, useContext } from "solid-js";
import type { Logger } from "@mp/logger";
import type { RpcCaller } from "@mp/rpc";
import { BinaryRpcTransceiver } from "@mp/rpc";
import type { AccessToken } from "@mp/auth";

export type RpcClient = SolidRpcInvoker<ServerRpcRouter>;

export type RpcClientMiddleware = () => Promise<unknown>;

export function createRpcClient(
  socket: WebSocket,
  logger: Logger,
  accessToken?: () => AccessToken | undefined,
): RpcClient {
  const transceiver = new BinaryRpcTransceiver({
    send: (data) => socket.send(data),
  });
  const handleMessage = transceiver.messageEventHandler(logger.error);
  socket.addEventListener("message", handleMessage);
  onCleanup(() => socket.removeEventListener("message", handleMessage));

  const syncAccessToken = createAccessTokenSyncBehavior(
    transceiver.call,
    socket,
    accessToken,
  );

  return createSolidRpcInvoker<ServerRpcRouter>(async (...args) => {
    await syncAccessToken();
    return transceiver.call(...args);
  });
}

export function useRpc() {
  return useContext(RpcClientContext);
}

export const RpcClientContext = createContext<RpcClient>(
  new Proxy({} as RpcClient, {
    get: () => {
      throw new Error("RpcClientContext must be provided");
    },
  }),
);

export const SocketContext = createContext<WebSocket>(
  new Proxy({} as WebSocket, {
    get: () => {
      throw new Error("SocketContext must be provided");
    },
  }),
);

/**
 * Synchronizes the access token with the game server.
 *
 * Some rpc procedures require authenticating first.
 * To authenticate we must specifically call `rpc.world.auth(token)`.
 * To not have to do this manually everywhere and to guarantee that
 * it's done properly, we always send new auth tokens to the game server
 * before any rpc call is made. This is an alternative to having
 * a header payload alongside with every authorized rpc call,
 * which with a JWT would amount to a lot of overhead (~1.6kb per call).
 */
function createAccessTokenSyncBehavior(
  call: RpcCaller,
  socket: WebSocket,
  accessToken?: () => AccessToken | undefined,
) {
  // We need a separate rpc invoker to actually call the auth procedure.
  // Calling the real rpc invoker that we're creating would cause an infinite loop.
  const rpc = createSolidRpcInvoker<ServerRpcRouter>(call);

  let hasSentAuthToken = false;

  // If the token changes we need to re-authenticate.
  createEffect(() => {
    if (accessToken?.()) {
      hasSentAuthToken = false;
    }
  });

  // Abnormal closure means the server may have restarted,
  // which means we need to re-authenticate.
  socket.addEventListener("close", handleCloseEvent);
  onCleanup(() => socket.removeEventListener("close", handleCloseEvent));
  function handleCloseEvent(e: CloseEvent) {
    // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
    // 1000 = Abnormal closure
    if (e.code !== 1000) {
      hasSentAuthToken = false;
    }
  }

  return async function ensureAuth() {
    if (!hasSentAuthToken) {
      const token = accessToken?.();
      if (!token) {
        throw new Error(
          "Attempted to call a protected rpc procedure without an access token",
        );
      }
      await rpc.world.auth(token);
      hasSentAuthToken = true;
    }
  };
}
