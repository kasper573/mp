import type { CheckboxState } from "@mp/ui";
import { Checkbox } from "@mp/ui";
import { useSignal, useSignalEffect } from "@mp/state/react";
import { PropertySignal, StorageSignal } from "@mp/state";
import { useRpc } from "../integrations/rpc";
import { env } from "../env";
import { miscDebugSettings } from "../signals/misc-debug-ui-settings";
import { useEffect } from "preact/hooks";
import { useQuery } from "@mp/query";

const pingEnabledSignal = new StorageSignal("local", "pingEnabled", true);

export function MiscDebugUi() {
  const rpc = useRpc();
  const isServerPatchOptimizerEnabled = useServerPatchOptimizerSignal();

  const serverVersion = rpc.buildVersion.useQuery();
  return (
    <>
      <div>Client version: {env.version}</div>
      <div>Server version: {serverVersion.data ?? "unknown"}</div>
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
    </>
  );
}

function PingIndicator() {
  const rpc = useRpc();
  const ping = useQuery({
    queryKey: ["ping"],
    async queryFn() {
      const start = performance.now();
      await rpc.ping();
      return performance.now() - start;
    },
    refetchInterval: 1000,
    initialData: 0,
  });

  return <>{ping.data.toFixed(2)} ms</>;
}

function useServerPatchOptimizerSignal() {
  const rpc = useRpc();
  const enabled = useSignal<CheckboxState>("indeterminate");
  const isRemoteEnabled = rpc.isPatchOptimizerEnabled.useQuery();

  useSignalEffect(() => {
    if (enabled.value !== "indeterminate") {
      void rpc.setPatchOptimizerEnabled(enabled.value);
    }
  });

  useEffect(() => {
    if (isRemoteEnabled.data !== undefined) {
      enabled.value = isRemoteEnabled.data;
    }
  }, [isRemoteEnabled.data, enabled]);

  return enabled;
}
