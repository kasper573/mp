import type { DbClient } from "@mp/db";
import {
  eq,
  consumableDefinitionTable,
  equipmentDefinitionTable,
} from "@mp/db";
import { gatewayRoles } from "@mp/keycloak";
import { ctxDbClient } from "../context";
import { roles } from "../integrations/auth";
import { rpc } from "../integrations/trpc";
import type {
  ConsumableDefinition,
  EquipmentDefinition,
  ItemDefinitionByReference,
} from "@mp/game-shared";
import { ItemReference } from "@mp/game-shared";
import { assert } from "@mp/std";
import type {
  ConsumableDefinitionId,
  EquipmentDefinitionId,
} from "@mp/db/types";

export const itemDefinition = rpc.procedure
  .use(roles([gatewayRoles.join]))
  .input(ItemReference)
  .query(
    ({
      ctx,
      input: itemRef,
    }): Promise<ItemDefinitionByReference<ItemReference>> => {
      const db = ctx.ioc.get(ctxDbClient);
      switch (itemRef.type) {
        case "consumable":
          return findConsumableDefinition(db, itemRef.definitionId);
        case "equipment":
          return findEquipmentDefinition(db, itemRef.definitionId);
      }
    },
  );

async function findConsumableDefinition(
  db: DbClient,
  id: ConsumableDefinitionId,
): Promise<ConsumableDefinition> {
  const [def] = await db
    .select()
    .from(consumableDefinitionTable)
    .where(eq(consumableDefinitionTable.id, id))
    .limit(1);

  assert(def, `Could not find consumable by id ${id}`);

  return { type: "consumable", ...def };
}

async function findEquipmentDefinition(
  db: DbClient,
  id: EquipmentDefinitionId,
): Promise<EquipmentDefinition> {
  const [def] = await db
    .select()
    .from(equipmentDefinitionTable)
    .where(eq(equipmentDefinitionTable.id, id))
    .limit(1);

  assert(def, `Could not find equipment by id ${id}`);
  return { type: "equipment", ...def };
}
