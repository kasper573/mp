export * from "./components";
export * from "./events";
export * from "./domain-ids";
export * from "./items";
export * from "./world";

export * from "./modules/area/area-resource";
export * from "./modules/area/graph-from-tiled";
export * from "./modules/area/hit-test-tiled-object";
export * from "./modules/area/tiled-fixture";
export * from "./modules/area/tiled-resource";
export * from "./modules/area/tiled-walkable-checker";

export { AreaModule } from "./modules/area/module";
export type { AreaApi } from "./modules/area/module";
export { CharacterModule } from "./modules/character/module";
export type {
  CharacterApi,
  CharacterClientApi,
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

export {
  PersistenceModule,
  buildWorldPersistenceSchema,
  CHARACTERS_COLLECTION,
} from "./modules/persistence/module";
export type { PersistenceApi } from "./modules/persistence/module";

export { PixiRendererModule } from "./modules/pixi-renderer/module";
export type {
  PixiRendererApi,
  SetAreaInput,
  AttachOptions,
} from "./modules/pixi-renderer/module";
export { AreaScene } from "./modules/pixi-renderer/area-scene";
export type {
  AreaSceneOptions,
  SendFn,
} from "./modules/pixi-renderer/area-scene";
export { ActorController } from "./modules/pixi-renderer/actor-controller";
export type { ActorControllerOptions } from "./modules/pixi-renderer/actor-controller";
export {
  TileHighlight,
  type TileHighlightOptions,
  type TileHighlightTarget,
} from "./modules/pixi-renderer/tile-highlight";
export { PreactRendererModule } from "./modules/preact-renderer/module";
export type { PreactRendererApi } from "./modules/preact-renderer/module";
export {
  PreactRendererContext,
  type PreactRendererContextValue,
} from "./modules/preact-renderer/context";
export { Hud, type HudProps } from "./modules/preact-renderer/hud";
export { HealthBar } from "./modules/preact-renderer/health-bar";
export { InventoryPanel } from "./modules/preact-renderer/inventory-panel";
export { RespawnDialog } from "./modules/preact-renderer/respawn-dialog";
export {
  useRendererContext,
  useLocalCharacterEntity,
  useEntityComponent,
  useRiftQuery,
} from "./modules/preact-renderer/hooks";
