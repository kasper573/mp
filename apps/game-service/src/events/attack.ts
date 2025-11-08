import { ActorIdType, CharacterIdType } from "@mp/game-shared";
import { characterRoles } from "@mp/keycloak";
import { accessCharacter } from "../etc/access-character";
import { roles } from "../integrations/auth";
import { evt } from "../integrations/event-router";
import { type } from "@mp/validate";

export const attack = evt.event
  .input(
    type({
      characterId: CharacterIdType,
      targetId: ActorIdType,
    }),
  )
  .use(roles([characterRoles.attack]))
  .handler(({ input: { characterId, targetId }, ctx }) => {
    const char = accessCharacter(ctx, characterId);

    if (targetId === characterId) {
      throw new Error("You can't attack yourself");
    }

    char.combat.attackTargetId = targetId;
  });
