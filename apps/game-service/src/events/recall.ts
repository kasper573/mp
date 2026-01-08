import { CharacterIdType } from "@mp/game-shared";
import { characterRoles } from "@mp/keycloak";
import { ctxArea } from "../context";
import { accessCharacter } from "../etc/access-character";
import { sendCharacterToArea } from "../etc/movement-behavior";
import { roles } from "../integrations/auth";
import { evt } from "../integrations/event-router";

export const recall = evt.event
  .input(CharacterIdType)
  .use(roles([characterRoles.recall]))
  .handler(({ input: characterId, ctx }) => {
    const char = accessCharacter(ctx, characterId);

    const area = ctx.get(ctxArea);
    const spawnPoint = { areaId: area.id, coords: area.start };

    sendCharacterToArea(
      ctx,
      char.identity.id,
      spawnPoint.areaId,
      spawnPoint.coords,
    );
  });
