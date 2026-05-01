import type { DialogProps } from "@mp/ui";
import { Button, Dialog } from "@mp/ui";
import { useRiftClient } from "../client/context";
import { respawnCharacter } from "../client/actions";

export function RespawnDialog(props: DialogProps) {
  const client = useRiftClient();
  return (
    <Dialog {...props}>
      <h1>You are dead</h1>
      <Button onClick={() => respawnCharacter(client)}>Respawn</Button>
    </Dialog>
  );
}
