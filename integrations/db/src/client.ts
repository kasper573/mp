import "reflect-metadata";
import { DataSource, type DataSourceOptions } from "typeorm";
import {
  ActorModel,
  Area,
  Character,
  ConsumableDefinition,
  ConsumableInstance,
  EquipmentDefinition,
  EquipmentInstance,
  Inventory,
  Npc,
  NpcReward,
  NpcSpawn,
} from "./entities";

export type DbClient = DataSource;

export function createDbClient(
  connectionString: string,
  logger?: boolean,
): DbClient {
  const dataSourceOptions: DataSourceOptions = {
    type: "postgres",
    url: connectionString,
    entities: [
      ActorModel,
      Area,
      Character,
      ConsumableDefinition,
      ConsumableInstance,
      EquipmentDefinition,
      EquipmentInstance,
      Inventory,
      Npc,
      NpcReward,
      NpcSpawn,
    ],
    synchronize: false,
    logging: logger,
  };

  return new DataSource(dataSourceOptions);
}
