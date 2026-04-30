import { object, u32 } from "@rift/types";
import type { EntityId } from "@rift/core";

export const AttackRequest = object({
  targetId: u32<EntityId>(),
});

export const Kill = object({
  attackerId: u32<EntityId>(),
  victimId: u32<EntityId>(),
});

export const combatEvents = [AttackRequest, Kill] as const;
