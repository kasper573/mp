import { f32, object, string, u32 } from "@rift/types";
import type {
  ConsumableDefinitionId,
  ConsumableInstanceId,
  EquipmentDefinitionId,
  EquipmentInstanceId,
} from "../identity/ids";

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
export const itemEvents = [] as const;
