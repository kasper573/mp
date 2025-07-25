import type { ServerRpcRouter } from "@mp/server";
import type { ReactRpcInvoker } from "@mp/rpc/react";
import { createReactRpcInvoker } from "@mp/rpc/react";
import { useContext } from "preact/hooks";
import type { Logger } from "@mp/logger";
import type { RpcCaller } from "@mp/rpc";
import { BinaryRpcTransceiver } from "@mp/rpc";
import type { AccessToken } from "@mp/auth";
import { createContext } from "preact";

export type RpcClient = ReactRpcInvoker<ServerRpcRouter>;

export type RpcClientMiddleware = () => Promise<unknown>;

export function createRpcClient(
  socket: WebSocket,
  logger: Logger,
  accessToken: () => AccessToken | undefined,
) {
  const transceiver = new BinaryRpcTransceiver({
    send: (data) => socket.send(data),
  });

  const syncBehavior = createAccessTokenSyncBehavior(
    transceiver.call,
    socket,
    accessToken,
    logger,
  );

  const invoker = createReactRpcInvoker<ServerRpcRouter>(async (...args) => {
    await syncBehavior.ensureAuth();
    return transceiver.call(...args);
  });

  function initialize() {
    const handleMessage = transceiver.messageEventHandler(logger.error);
    socket.addEventListener("message", handleMessage);
    const stopBehavior = syncBehavior.createEffect();
    return () => {
      socket.removeEventListener("message", handleMessage);
      stopBehavior();
    };
  }

  return [invoker, initialize] as const;
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
  accessToken: () => AccessToken | undefined,
  logger: Logger,
) {
  // We need a separate rpc invoker to actually call the auth procedure.
  // Calling the real rpc invoker that we're creating would cause an infinite loop.
  const rpc = createReactRpcInvoker<ServerRpcRouter>(call);

  let lastSeenToken: AccessToken | undefined;
  let currentAuthSendPromise: Promise<void> | undefined;

  function createEffect() {
    // Abnormal closure means the server may have restarted,
    // which means we need to re-authenticate.
    function handleCloseEvent(e: CloseEvent) {
      // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
      // 1000 = Abnormal closure
      if (e.code !== 1000) {
        logger.debug(
          "WebSocket closed abnormally, will re-authenticate on next rpc call",
        );
        lastSeenToken = undefined;
        currentAuthSendPromise = undefined;
      }
    }

    socket.addEventListener("close", handleCloseEvent);

    return function cleanup() {
      socket.removeEventListener("close", handleCloseEvent);
    };
  }

  async function ensureAuth() {
    const token = accessToken();
    const didTokenChange = token !== lastSeenToken;
    lastSeenToken = token;

    if (didTokenChange && token && !currentAuthSendPromise) {
      logger.debug("Sending auth token to rpc server");
      currentAuthSendPromise = rpc.world.auth(token).then(() => {
        currentAuthSendPromise = undefined;
      });
    }
    await currentAuthSendPromise;
  }

  return { ensureAuth, createEffect };
}
