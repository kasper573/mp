import type { DialogProps } from "@mp/ui";
import { Button, Dialog } from "@mp/ui";
import { useContext } from "preact/hooks";
import { RiftContext } from "../client";
import { respawnCharacter } from "./actions";

export function RespawnDialog(props: DialogProps) {
  const client = useContext(RiftContext);
  return (
    <Dialog {...props}>
      <h1>You are dead</h1>
      <Button onClick={() => respawnCharacter(client)}>Respawn</Button>
    </Dialog>
  );
}
