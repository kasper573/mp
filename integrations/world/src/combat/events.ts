import { object, u32 } from "@rift/types";
import type { EntityId } from "@rift/core";

export const AttackRequest = object({
  targetId: u32<EntityId>(),
});

export const Kill = object({
  attackerId: u32<EntityId>(),
  victimId: u32<EntityId>(),
});

export const Attacked = object({
  entityId: u32<EntityId>(),
});

export const Died = object({
  entityId: u32<EntityId>(),
});

export const combatEvents = [AttackRequest, Kill, Attacked, Died] as const;
