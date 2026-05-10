import { Button, Dialog } from "@mp/ui";
import { useContext } from "preact/hooks";
import { RiftContext } from "../client";
import { respawnCharacter } from "./actions";
import { claimedCharacterIsDead } from "./signals";

export function RespawnDialog() {
  const client = useContext(RiftContext);
  const open = claimedCharacterIsDead(client.world.signal).value;
  return (
    <Dialog open={open}>
      <h1>You are dead</h1>
      <Button onClick={() => respawnCharacter(client)}>Respawn</Button>
    </Dialog>
  );
}
