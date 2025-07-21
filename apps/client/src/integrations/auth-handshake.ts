import type { AccessToken } from "@mp/auth";
import type { Logger } from "@mp/logger";

export interface AuthHandshakeOptions {
  socket: WebSocket;
  logger: Logger;
  handshake: (token: AccessToken) => Promise<unknown>;
  getAccessToken: () => AccessToken | undefined;
}

/**
 * Delays all socket sends until an auth handshake has been made.
 */
export function enhanceWebSocketWithAuthHandshake(
  opt: AuthHandshakeOptions,
): AuthHandshakeEnhancedWebSocket {
  let lastSeenToken: AccessToken | undefined;
  let currentAuthSendPromise: Promise<void> | undefined;

  const originalSend = opt.socket.send.bind(opt.socket);

  opt.socket.send = async (...args) => {
    const token = opt.getAccessToken();
    const didTokenChange = token !== lastSeenToken;
    lastSeenToken = token;

    if (didTokenChange && token && !currentAuthSendPromise) {
      opt.logger.debug("Delaying socket send. Performing new auth handshake.");
      currentAuthSendPromise = opt.handshake(token).then(() => {
        currentAuthSendPromise = undefined;
      });
    }
    await currentAuthSendPromise;
    originalSend(...args);
  };

  // Abnormal closure means the server may have restarted,
  // which means we need to re-authenticate.
  function handleCloseEvent(e: CloseEvent) {
    // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
    // 1000 = Abnormal closure
    if (e.code !== 1000) {
      opt.logger.debug(
        "WebSocket closed abnormally, will re-authenticate on next socket send",
      );
      lastSeenToken = undefined;
      currentAuthSendPromise = undefined;
    }
  }

  (opt.socket as AuthHandshakeEnhancedWebSocket).handleCloseEvent =
    handleCloseEvent;

  return opt.socket as AuthHandshakeEnhancedWebSocket;
}

interface AuthHandshakeEnhancedWebSocket extends WebSocket {
  handleCloseEvent(e: CloseEvent): void;
}
