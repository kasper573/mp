import type { ItemDefinition } from "@mp/game-shared";
import { equipmentDefinitionTable, consumableDefinitionTable } from "../schema";
import {
  equipmentDefinitionFromDbFields,
  consumableDefinitionFromDbFields,
} from "../utils/transform";
import { procedure } from "../utils/procedure";

export const selectAllItemDefinitions = procedure().query(
  async (drizzle): Promise<ItemDefinition[]> => {
    const [equipmentRows, consumableRows] = await Promise.all([
      drizzle.select().from(equipmentDefinitionTable),
      drizzle.select().from(consumableDefinitionTable),
    ]);

    return [
      ...equipmentRows.map(equipmentDefinitionFromDbFields),
      ...consumableRows.map(consumableDefinitionFromDbFields),
    ];
  },
);
