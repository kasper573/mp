import type { DialogProps } from "@mp/ui";
import { Button, Dialog } from "@mp/ui";
import { useCombat } from "../../context";

export function RespawnDialog(props: DialogProps) {
  const combat = useCombat();

  return (
    <Dialog {...props}>
      <h1>You are dead</h1>
      <Button onClick={() => combat.respawn()}>Respawn</Button>
    </Dialog>
  );
}
