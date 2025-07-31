import type { CharacterId } from "@mp/db/types";
import { characterRoles } from "@mp/keycloak";
import { type VectorLike, Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";
import { accessCharacter } from "../etc/access-character";
import { roles } from "../integrations/auth";
import { evt } from "../integrations/event-router";

export const move = evt.event
  .input<{
    characterId: CharacterId;
    to: VectorLike<Tile>;
    desiredPortalId?: ObjectId;
  }>()
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
