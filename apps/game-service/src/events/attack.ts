import type { CharacterId } from "@mp/db/types";
import type { ActorId } from "@mp/game-shared";
import { characterRoles } from "@mp/keycloak";
import { accessCharacter } from "../etc/access-character";
import { evt, roles } from "../package";

export const attack = evt.event
  .input<{ characterId: CharacterId; targetId: ActorId }>()
  .use(roles([characterRoles.attack]))
  .handler(({ input: { characterId, targetId }, ctx }) => {
    const char = accessCharacter(ctx, characterId);

    if (targetId === characterId) {
      throw new Error("You can't attack yourself");
    }

    char.combat.attackTargetId = targetId;
  });
