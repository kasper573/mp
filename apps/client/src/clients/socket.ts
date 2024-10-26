import { SocketClient } from "@mp/network/client";
import { AuthContext } from "@mp/auth/client";
import { createEffect, createSignal, onCleanup, useContext } from "solid-js";
import { env } from "../env";
import { applyWorldStateUpdate, setConnected } from "../state/signals";
import { fetchAuthToken } from "./auth";

export function useSocketClient() {
  const [getToken, setToken] = createSignal<string | undefined>();

  const authClient = useContext(AuthContext);
  const socketClient = new SocketClient({
    url: env.wsUrl,
    applyStateUpdate: applyWorldStateUpdate,
    onConnect: () => setConnected(true),
    onDisconnect: () => setConnected(false),
  });

  function refreshToken() {
    void fetchAuthToken(authClient).then(setToken);
  }

  createEffect(() => {
    const token = getToken();
    if (token) {
      socketClient.authenticate(token);
    }
  });

  onCleanup(authClient.addListener(refreshToken));
  onCleanup(() => socketClient.dispose());

  return socketClient;
}
