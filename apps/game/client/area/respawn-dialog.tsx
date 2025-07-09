import type { DialogProps } from "@mp/ui";
import { Button, Dialog } from "@mp/ui";
import { ioc } from "../context";
import { ctxGameStateClient } from "../game-state/game-state-client";

export function RespawnDialog(props: DialogProps) {
  const client = ioc.get(ctxGameStateClient);

  return (
    <Dialog {...props}>
      <h1>You are dead</h1>
      <Button onClick={() => void client.actions.respawn()}>Respawn</Button>
    </Dialog>
  );
}
