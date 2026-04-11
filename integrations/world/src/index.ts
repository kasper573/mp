export * from "./area";
export * from "./components";
export * from "./events";
export * from "./domain-ids";
export * from "./world";
export { AreaModule } from "./modules/area/module";
export type { AreaApi } from "./modules/area/module";
export { CharacterModule } from "./modules/character/module";
export type {
  CharacterApi,
  SpawnCharacterInit,
} from "./modules/character/module";
export { MovementModule } from "./modules/movement/module";
export type { MovementApi } from "./modules/movement/module";
export { CombatModule } from "./modules/combat/module";
export type { CombatApi } from "./modules/combat/module";
export { NpcAiModule } from "./modules/npc-ai/module";
export type { NpcAiApi } from "./modules/npc-ai/module";
export { NpcSpawnerModule } from "./modules/npc-spawner/module";
export type {
  NpcSpawnerApi,
  NpcSpawnDef,
  NpcTemplate,
} from "./modules/npc-spawner/module";
export { InventoryModule } from "./modules/inventory/module";
export type {
  InventoryApi,
  AddConsumableInput,
  AddConsumableResult,
  AddEquipmentInput,
} from "./modules/inventory/module";
