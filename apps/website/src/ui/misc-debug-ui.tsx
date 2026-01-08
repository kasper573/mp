import { PropertySignal, StorageSignal } from "@mp/state";
import { useSignal, useSignalEffect } from "@mp/state/react";
import type { CheckboxState } from "@mp/ui";
import { Button, Checkbox } from "@mp/ui";

import { graphql, useQueryBuilder } from "@mp/api-service/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "preact/hooks";
import { env } from "../env";
import { miscDebugSettings } from "../signals/misc-debug-ui-settings";
import type { GameStateClient } from "@mp/game-client";

const pingEnabledSignal = new StorageSignal("local", "pingEnabled", true);

export function MiscDebugUi({ stateClient }: { stateClient: GameStateClient }) {
  const qb = useQueryBuilder();
  const isServerPatchOptimizerEnabled = useServerPatchOptimizerSignal();
  const { data } = useQuery(qb.queryOptions(serverSettings));

  return (
    <>
      <div>Client version: {env.version}</div>
      <div>Server version: {data?.serverVersion ?? "unknown"}</div>
      <label>
        Show ping <Checkbox signal={pingEnabledSignal} />{" "}
        {pingEnabledSignal.value ? <PingIndicator /> : null}
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
  const ping = useQuery({
    queryKey: ["ping"],
    async queryFn() {
      const start = performance.now();
      await fetch(`${env.apiUrl}/health`);
      return performance.now() - start;
    },
    refetchInterval: 5000,
    initialData: 0,
  });

  return <>{ping.data.toFixed(2)} ms</>;
}

function useServerPatchOptimizerSignal() {
  const qb = useQueryBuilder();
  const local = useSignal<CheckboxState>("indeterminate");
  const remote = useQuery(qb.queryOptions(serverSettings));
  const setRemote = useMutation(qb.mutationOptions(setPatchOptimizerEnabled));

  useSignalEffect(() => {
    if (local.value !== "indeterminate") {
      setRemote.mutate({ newValue: local.value });
    }
  });

  useEffect(() => {
    if (remote.data !== undefined) {
      local.value = remote.data.isPatchOptimizerEnabled;
    }
  }, [remote.data, local]);

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
