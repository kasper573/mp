import type { CharacterId } from "@mp/game-shared";
import { characterRoles } from "@mp/keycloak";
import { ctxArea } from "../context";
import { accessCharacter } from "../etc/access-character";
import { sendCharacterToArea } from "../etc/movement-behavior";
import { roles } from "../integrations/auth";
import { evt } from "../integrations/event-router";

export const respawn = evt.event
  .input<CharacterId>()
  .use(roles([characterRoles.respawn]))
  .handler(({ input: characterId, ctx }) => {
    const char = accessCharacter(ctx, characterId);

    if (char.combat.health > 0) {
      throw new Error("Character is not dead");
    }

    const area = ctx.get(ctxArea);
    const spawnPoint = { areaId: area.id, coords: area.start };
    char.combat.health = char.combat.maxHealth;

    sendCharacterToArea(
      ctx,
      char.identity.id,
      spawnPoint.areaId,
      spawnPoint.coords,
    );
  });
