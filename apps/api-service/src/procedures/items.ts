import type { DbClient } from "@mp/db";
import {
  ConsumableDefinition as ConsumableDefinitionEntity,
  EquipmentDefinition as EquipmentDefinitionEntity,
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
  const def = await db.getRepository(ConsumableDefinitionEntity).findOne({
    where: { id },
  });

  if (!def) {
    throw new Error(`Could not find consumable by id ${id}`);
  }

  return {
    type: "consumable",
    id: def.id,
    name: def.name,
    maxStackSize: def.maxStackSize,
  };
}

async function findEquipmentDefinition(
  db: DbClient,
  id: EquipmentDefinitionId,
): Promise<EquipmentDefinition> {
  const def = await db.getRepository(EquipmentDefinitionEntity).findOne({
    where: { id },
  });

  if (!def) {
    throw new Error(`Could not find equipment by id ${id}`);
  }

  return {
    type: "equipment",
    id: def.id,
    name: def.name,
    maxDurability: def.maxDurability,
  };
}
