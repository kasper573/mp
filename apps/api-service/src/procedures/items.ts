import { gatewayRoles } from "@mp/keycloak";
import { ctxDb } from "../context";
import { roles } from "../integrations/auth";
import { rpc } from "../integrations/trpc";
import type { ItemDefinitionByReference } from "@mp/game-shared";
import { ItemReference } from "@mp/game-shared";
import { promiseFromResult } from "@mp/std";

export const itemDefinition = rpc.procedure
  .use(roles([gatewayRoles.join]))
  .input(ItemReference)
  .query(
    async ({
      ctx,
      input: itemRef,
    }): Promise<ItemDefinitionByReference<ItemReference>> => {
      const db = ctx.ioc.get(ctxDb);
      switch (itemRef.type) {
        case "consumable":
          return {
            type: "consumable",
            ...(await promiseFromResult(
              db.selectConsumableDefinition(itemRef.definitionId),
            )),
          };
        case "equipment":
          return {
            type: "equipment",
            ...(await promiseFromResult(
              db.selectEquipmentDefinition(itemRef.definitionId),
            )),
          };
      }
    },
  );
