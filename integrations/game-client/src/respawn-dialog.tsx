import type { DialogProps } from "@mp/ui";
import { Button, Dialog } from "@mp/ui";
import { ctxGameStateClient } from "./game-state-client";
import { ioc } from "./ioc";

export function RespawnDialog(props: DialogProps) {
  const client = ioc.get(ctxGameStateClient);

  return (
    <Dialog {...props}>
      <h1>You are dead</h1>
      <Button onClick={() => void client.actions.respawn()}>Respawn</Button>
    </Dialog>
  );
}
