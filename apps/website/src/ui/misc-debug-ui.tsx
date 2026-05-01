import { PropertySignal, StorageSignal } from "@mp/state";
import { Button, Checkbox } from "@mp/ui";
import { recallCharacter, useRiftClient } from "@mp/world";
import { env } from "../env";
import { miscDebugSettings } from "../signals/misc-debug-ui-settings";

const pingEnabledSignal = new StorageSignal("local", "pingEnabled", true);

export function MiscDebugUi() {
  const client = useRiftClient();
  return (
    <>
      <div>Client version: {env.version}</div>
      <label>
        Show ping <Checkbox signal={pingEnabledSignal} />
      </label>
      <br />
      <label>
        Use client side game state interpolator:{" "}
        <Checkbox
          signal={new PropertySignal(miscDebugSettings, "useInterpolator")}
        />
      </label>
      <br />
      <Button onClick={() => recallCharacter(client)}>Recall</Button>
    </>
  );
}
