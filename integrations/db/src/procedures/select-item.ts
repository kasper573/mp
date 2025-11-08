import assert from "assert";
import { eq } from "drizzle-orm";
import { consumableDefinitionTable, equipmentDefinitionTable } from "../schema";
import type {
  ConsumableDefinitionId,
  EquipmentDefinitionId,
} from "@mp/game-shared";
import { procedure } from "../utils/procedure";

export const selectConsumableDefinition = procedure()
  .input<ConsumableDefinitionId>()
  .query(async (drizzle, id) => {
    const [def] = await drizzle
      .select()
      .from(consumableDefinitionTable)
      .where(eq(consumableDefinitionTable.id, id))
      .limit(1);

    assert(def, `Could not find consumable by id ${id}`);
    return def;
  });

export const selectEquipmentDefinition = procedure()
  .input<EquipmentDefinitionId>()
  .query(async (drizzle, id) => {
    const [def] = await drizzle
      .select()
      .from(equipmentDefinitionTable)
      .where(eq(equipmentDefinitionTable.id, id))
      .limit(1);

    assert(def, `Could not find equipment by id ${id}`);
    return def;
  });
