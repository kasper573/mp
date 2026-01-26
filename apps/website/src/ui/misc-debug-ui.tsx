import { PropertySignal, StorageSignal } from "@mp/state";
import { useSignal, useSignalEffect } from "@mp/state/solid";
import type { CheckboxState } from "@mp/ui";
import { Button, Checkbox } from "@mp/ui";

import { graphql, useQueryBuilder } from "@mp/api-service/client";
import { createMutation, createQuery } from "@tanstack/solid-query";
import { createEffect, Show } from "solid-js";
import { env } from "../env";
import { miscDebugSettings } from "../signals/misc-debug-ui-settings";
import type { GameStateClient } from "@mp/game-client";

const pingEnabledSignal = new StorageSignal("local", "pingEnabled", true);

export function MiscDebugUi(props: { stateClient: GameStateClient }) {
  const qb = useQueryBuilder();
  const isServerPatchOptimizerEnabled = useServerPatchOptimizerSignal();
  const query = createQuery(() => qb.queryOptions(serverSettings));

  return (
    <>
      <div>Client version: {env.version}</div>
      <div>Server version: {query.data?.serverVersion ?? "unknown"}</div>
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
      <Button onClick={() => props.stateClient.actions.recall()}>Recall</Button>
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

  useSignalEffect(() => {
    if (local.get() !== "indeterminate") {
      setRemote.mutate({ newValue: local.get() as boolean });
    }
  });

  createEffect(() => {
    if (remote.data !== undefined) {
      local.write(remote.data.isPatchOptimizerEnabled);
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
