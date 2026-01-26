import { PropertySignal, StorageSignal } from "@mp/state";
import { useSignal, effect } from "@mp/state/solid";
import type { CheckboxState } from "@mp/ui";
import { Button, Checkbox } from "@mp/ui";

import { graphql, useQueryBuilder } from "@mp/api-service/client";
import { createMutation, createQuery } from "@tanstack/solid-query";
import { createEffect, Show } from "solid-js";
import { env } from "../env";
import { miscDebugSettings } from "../signals/misc-debug-ui-settings";
import type { GameStateClient } from "@mp/game-client";

const pingEnabledSignal = new StorageSignal("local", "pingEnabled", true);

export function MiscDebugUi({ stateClient }: { stateClient: GameStateClient }) {
  const qb = useQueryBuilder();
  const isServerPatchOptimizerEnabled = useServerPatchOptimizerSignal();
  const queryResult = createQuery(() => qb.queryOptions(serverSettings));

  return (
    <>
      <div>Client version: {env.version}</div>
      <div>Server version: {queryResult.data?.serverVersion ?? "unknown"}</div>
      <label>
        Show ping <Checkbox signal={pingEnabledSignal} />{" "}
        <Show when={pingEnabledSignal.get()}>
          <PingIndicator />
        </Show>
      </label>
      <br />
      <label>
        Use server side patch optimizer:{" "}
        <Checkbox signal={isServerPatchOptimizerEnabled} />
      </label>
      <br />
      <label>
        Use client side patch optimizer:{" "}
        <Checkbox
          signal={new PropertySignal(miscDebugSettings, "usePatchOptimizer")}
        />
      </label>
      <br />
      <label>
        Use client side game state interpolator:{" "}
        <Checkbox
          signal={new PropertySignal(miscDebugSettings, "useInterpolator")}
        />
      </label>
      <br />
      <Button onClick={() => stateClient.actions.recall()}>Recall</Button>
    </>
  );
}

function PingIndicator() {
  const ping = createQuery(() => ({
    queryKey: ["ping"],
    async queryFn() {
      const start = performance.now();
      await fetch(`${env.api.url}/health`);
      return performance.now() - start;
    },
    refetchInterval: 5000,
    initialData: 0,
  }));

  return <>{ping.data?.toFixed(2)} ms</>;
}

function useServerPatchOptimizerSignal() {
  const qb = useQueryBuilder();
  const local = useSignal<CheckboxState>("indeterminate");
  const remote = createQuery(() => qb.queryOptions(serverSettings));
  const setRemote = createMutation(() =>
    qb.mutationOptions(setPatchOptimizerEnabled),
  );

  effect(() => {
    if (local.get() !== "indeterminate") {
      setRemote.mutate({ newValue: local.get() as boolean });
    }
  });

  createEffect(() => {
    if (remote.data !== undefined) {
      local.set(remote.data.isPatchOptimizerEnabled);
    }
  });

  return local;
}

const serverSettings = graphql(`
  query MiscDebugUi {
    serverVersion
    isPatchOptimizerEnabled
  }
`);

const setPatchOptimizerEnabled = graphql(`
  mutation SetGameServiceSettings($newValue: Boolean!) {
    setPatchOptimizerEnabled(newValue: $newValue)
  }
`);
