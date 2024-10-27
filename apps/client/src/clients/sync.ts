import { AuthContext } from "@mp/auth/client";
import { createEffect, createSignal, onCleanup, useContext } from "solid-js";
import { syncClient } from "../state/signals";
import { fetchAuthToken } from "./auth";

export function useSyncClient() {
  const [getToken, setToken] = createSignal<string | undefined>();

  const authClient = useContext(AuthContext);

  function refreshToken() {
    void fetchAuthToken(authClient).then(setToken);
  }

  createEffect(() => {
    const token = getToken();
    if (token) {
      syncClient.authenticate(token);
    }
  });

  onCleanup(authClient.addListener(refreshToken));
  onCleanup(() => syncClient.dispose());

  return syncClient;
}
