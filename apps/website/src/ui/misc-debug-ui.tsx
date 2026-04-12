import { StorageSignal } from "@mp/state";
import { Checkbox } from "@mp/ui";
import { useQuery } from "@tanstack/react-query";
import { env } from "../env";
import type { GameStateClient } from "@mp/game-client";

const pingEnabledSignal = new StorageSignal("local", "pingEnabled", true);

export function MiscDebugUi({ stateClient }: { stateClient: GameStateClient }) {
  return (
    <>
      <div>Client version: {env.version}</div>
      <label>
        Show ping <Checkbox signal={pingEnabledSignal} />{" "}
        {pingEnabledSignal.value ? <PingIndicator /> : null}
      </label>
      <br />
      <button onClick={() => stateClient.recall()}>Recall</button>
    </>
  );
}

function PingIndicator() {
  const ping = useQuery({
    queryKey: ["ping"],
    async queryFn() {
      const start = performance.now();
      await fetch(
        `${env.gameServiceUrl.replace("wss://", "https://").replace("ws://", "http://")}/health`,
      );
      return performance.now() - start;
    },
    refetchInterval: 5000,
    initialData: 0,
  });

  return <>{ping.data.toFixed(2)} ms</>;
}
