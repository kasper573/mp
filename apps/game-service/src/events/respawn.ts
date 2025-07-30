import type { CharacterId } from "@mp/db/types";
import { characterRoles } from "@mp/keycloak";
import { ctxGameStateLoader } from "../context";
import { accessCharacter } from "../etc/access-character";
import { sendCharacterToArea } from "../etc/movement-behavior";
import { evt, roles } from "../package";

export const respawn = evt.event
  .input<CharacterId>()
  .use(roles([characterRoles.respawn]))
  .handler(({ input: characterId, ctx }) => {
    const char = accessCharacter(ctx, characterId);

    if (char.combat.health > 0) {
      throw new Error("Character is not dead");
    }

    const loader = ctx.get(ctxGameStateLoader);
    const spawnPoint = loader.getDefaultSpawnPoint();
    char.combat.health = char.combat.maxHealth;

    sendCharacterToArea(
      ctx,
      char.identity.id,
      spawnPoint.areaId,
      spawnPoint.coords,
    );
  });
