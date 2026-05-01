import { PropertySignal, StorageSignal } from "@mp/state";
import { Button, Checkbox } from "@mp/ui";
import { env } from "../env";
import { miscDebugSettings } from "../signals/misc-debug-ui-settings";
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
  return <>—</>;
}
