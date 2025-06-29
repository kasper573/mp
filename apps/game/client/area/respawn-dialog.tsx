import type { DialogProps } from "@mp/ui";
import { Button, Dialog } from "@mp/ui";
import { useGameActions } from "../game-state/solid-js";

export function RespawnDialog(props: DialogProps) {
  const actions = useGameActions();

  return (
    <Dialog {...props}>
      <h1>You are dead</h1>
      <Button onClick={() => void actions.respawn()}>Respawn</Button>
    </Dialog>
  );
}
