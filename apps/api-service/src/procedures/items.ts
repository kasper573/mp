import type { DbClient } from "@mp/db";
import { e } from "@mp/db";
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
  const results = await e
    .select(e.ConsumableDefinition, (def) => ({
      definitionId: true,
      name: true,
      maxStackSize: true,
      filter: e.op(def.definitionId, "=", e.str(id)),
      limit: 1,
    }))
    .run(db);

  assert(results.length > 0, `Could not find consumable by id ${id}`);

  return {
    type: "consumable",
    id: results[0].definitionId as ConsumableDefinitionId,
    name: results[0].name,
    maxStackSize: Number(results[0].maxStackSize),
  };
}

async function findEquipmentDefinition(
  db: DbClient,
  id: EquipmentDefinitionId,
): Promise<EquipmentDefinition> {
  const results = await e
    .select(e.EquipmentDefinition, (def) => ({
      definitionId: true,
      name: true,
      maxDurability: true,
      filter: e.op(def.definitionId, "=", e.str(id)),
      limit: 1,
    }))
    .run(db);

  assert(results.length > 0, `Could not find equipment by id ${id}`);

  return {
    type: "equipment",
    id: results[0].definitionId as EquipmentDefinitionId,
    name: results[0].name,
    maxDurability: Number(results[0].maxDurability),
  };
}
