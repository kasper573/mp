import type { DialogProps } from "@mp/ui";
import { Button, Dialog } from "@mp/ui";
import { useContext } from "preact/hooks";
import { GameStateClientContext } from "./context";

export function RespawnDialog(props: DialogProps) {
  const client = useContext(GameStateClientContext);

  return (
    <Dialog {...props}>
      <h1>You are dead</h1>
      <Button onClick={() => void client.actions.respawn()}>Respawn</Button>
    </Dialog>
  );
}
