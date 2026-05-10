import { StorageSignal } from "@mp/state";
import { Button, Checkbox } from "@mp/ui";
import { interpolationEnabled, recallCharacter, RiftContext } from "@mp/world";
import { useContext } from "preact/hooks";
import { env } from "../env";

const pingEnabledSignal = new StorageSignal("local", "pingEnabled", true);

export function MiscDebugUi() {
  const client = useContext(RiftContext);
  return (
    <>
      <div>Client version: {env.version}</div>
      <label>
        Show ping <Checkbox signal={pingEnabledSignal} />
      </label>
      <br />
      <label>
        Use client side game state interpolator:{" "}
        <Checkbox signal={interpolationEnabled} />
      </label>
      <br />
      <Button onClick={() => recallCharacter(client)}>Recall</Button>
    </>
  );
}
