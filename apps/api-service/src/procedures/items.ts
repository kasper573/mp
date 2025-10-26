import { selectConsumableDefinition, selectEquipmentDefinition } from "@mp/db";
import { gatewayRoles } from "@mp/keycloak";
import { ctxDbClient } from "../context";
import { roles } from "../integrations/auth";
import { rpc } from "../integrations/trpc";
import type { ItemDefinitionByReference } from "@mp/game-shared";
import { ItemReference } from "@mp/game-shared";

export const itemDefinition = rpc.procedure
  .use(roles([gatewayRoles.join]))
  .input(ItemReference)
  .query(
    async ({
      ctx,
      input: itemRef,
    }): Promise<ItemDefinitionByReference<ItemReference>> => {
      const db = ctx.ioc.get(ctxDbClient);
      switch (itemRef.type) {
        case "consumable":
          return {
            type: "consumable",
            ...(await selectConsumableDefinition(db, itemRef.definitionId)),
          };
        case "equipment":
          return {
            type: "equipment",
            ...(await selectEquipmentDefinition(db, itemRef.definitionId)),
          };
      }
    },
  );
