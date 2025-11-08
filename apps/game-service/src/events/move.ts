import { CharacterIdType } from "@mp/game-shared";
import { characterRoles } from "@mp/keycloak";
import { Vector } from "@mp/math";
import { TileType } from "@mp/std";
import { ObjectIdType } from "@mp/tiled-loader";
import { accessCharacter } from "../etc/access-character";
import { roles } from "../integrations/auth";
import { evt } from "../integrations/event-router";
import { type } from "@mp/validate";

export const move = evt.event
  .input(
    type({
      characterId: CharacterIdType,
      to: { x: TileType, y: TileType },
      ["desiredPortalId?"]: ObjectIdType,
    }),
  )
  .use(roles([characterRoles.move]))
  .handler(({ input: { characterId, to, desiredPortalId }, ctx }) => {
    const char = accessCharacter(ctx, characterId);

    if (!char.combat.health) {
      throw new Error("Cannot move a dead character");
    }

    char.combat.attackTargetId = undefined;
    char.movement.moveTarget = Vector.from(to);
    char.movement.desiredPortalId = desiredPortalId;
  });
