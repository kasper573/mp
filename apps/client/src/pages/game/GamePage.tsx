import { useAuthState } from "@mp/auth/client";
import { Application } from "@mp/solid-pixi";
import { Match, Switch, Show, createMemo } from "solid-js";
import { atoms } from "@mp/style";
import { EngineProvider } from "@mp/engine";
import { createQuery } from "@tanstack/solid-query";
import { loadAreaResource } from "../../state/loadAreaResource";
import { myCharacter } from "../../state/signals";
import { useApiClient } from "../../state/api";
import * as styles from "./GamePage.css";
import { AreaScene } from "./AreaScene";

export default function GamePage() {
  const { isSignedIn } = useAuthState();
  useApiClient();

  const areaId = createMemo(() => myCharacter()?.areaId);
  const query = createQuery(() => {
    const id = areaId();
    return {
      queryKey: ["area", id],
      queryFn: () => (id ? loadAreaResource(id) : null),
    };
  });

  return (
    <Switch>
      <Match when={isSignedIn()}>
        <Application class={styles.container}>
          {({ viewport }) => (
            <EngineProvider viewport={viewport}>
              <Show when={query.data} keyed>
                {(data) => <AreaScene area={data} />}
              </Show>
            </EngineProvider>
          )}
        </Application>
      </Match>
      <Match when={!isSignedIn()}>
        <div class={atoms({ padding: "2xl" })}>Sign in to play</div>
      </Match>
    </Switch>
  );
}
