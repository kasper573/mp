import { gatewayRoles } from "@mp/keycloak";
import type { ApiContext } from "../context";
import { ctxDb } from "../context";
import { roles } from "../integrations/auth";
import type { ItemDefinition } from "@mp/game-shared";
import type { ItemReference } from "@mp/game-shared";
import { promiseFromResult } from "@mp/std";

/** @gqlQueryField */
export async function itemDefinition(
  ref: ItemReference,
  ctx: ApiContext,
): Promise<ItemDefinition> {
  await roles(ctx, [gatewayRoles.join]);

  const db = ctx.ioc.get(ctxDb);
  switch (ref.type) {
    case "consumable":
      return {
        type: "consumable",
        ...(await promiseFromResult(
          db.selectConsumableDefinition(ref.definitionId),
        )),
      };
    case "equipment":
      return {
        type: "equipment",
        ...(await promiseFromResult(
          db.selectEquipmentDefinition(ref.definitionId),
        )),
      };
  }
}
