import { ctxGameStateClient, ioc } from "@mp/game/client";
import type { DialogProps } from "@mp/ui";
import { Button, Dialog } from "@mp/ui";

export function RespawnDialog(props: DialogProps) {
  const client = ioc.get(ctxGameStateClient);

  return (
    <Dialog {...props}>
      <h1>You are dead</h1>
      <Button onClick={() => void client.actions.respawn()}>Respawn</Button>
    </Dialog>
  );
}
