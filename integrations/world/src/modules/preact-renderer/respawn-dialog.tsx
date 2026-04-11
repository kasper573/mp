import { Button, Dialog } from "@mp/ui";
import { Health } from "../../components";
import {
  useEntityComponent,
  useLocalCharacterEntity,
  useRendererContext,
} from "./hooks";

export function RespawnDialog() {
  const ctx = useRendererContext();
  const entity = useLocalCharacterEntity();
  const health = useEntityComponent(entity, Health);
  const isDead = !!health.value && health.value.current <= 0;

  return (
    <Dialog open={isDead}>
      <h1>You are dead</h1>
      <Button onClick={() => ctx.respawn.value?.()}>Respawn</Button>
    </Dialog>
  );
}
