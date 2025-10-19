import { DataSource } from "typeorm";
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
} from "./src/entities";

export default new DataSource({
  type: "postgres",
  url: process.env.MP_GAME_SERVICE_DATABASE_CONNECTION_STRING,
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
  migrations: ["src/migrations/*.ts"],
  synchronize: false,
  logging: false,
});
