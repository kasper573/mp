import { f32, object, string, u32 } from "@rift/types";
import type { Branded } from "@mp/std";
import type {
  ConsumableDefinitionId,
  EquipmentDefinitionId,
} from "@mp/fixtures";

export type ConsumableInstanceId = Branded<string, "ConsumableInstanceId">;
export type EquipmentInstanceId = Branded<string, "EquipmentInstanceId">;

export const ConsumableInstance = object({
  instanceId: string<ConsumableInstanceId>(),
  definitionId: string<ConsumableDefinitionId>(),
  stackSize: u32(),
});

export const EquipmentInstance = object({
  instanceId: string<EquipmentInstanceId>(),
  definitionId: string<EquipmentDefinitionId>(),
  durability: f32(),
});

export const itemComponents = [ConsumableInstance, EquipmentInstance] as const;
