import type { DialogProps } from "@mp/ui";
import { Button, Dialog } from "@mp/ui";
import { useContext } from "solid-js";
import { GameStateClientContext } from "../GameStateClient";

export function RespawnDialog(props: DialogProps) {
  const state = useContext(GameStateClientContext);

  return (
    <Dialog {...props}>
      <h1>You are dead</h1>
      <Button onClick={() => void state.respawn()}>Respawn</Button>
    </Dialog>
  );
}
