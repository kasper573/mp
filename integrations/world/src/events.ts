import { f32, i32, string, struct } from "@rift/core";
import type { AreaId, CharacterId, ObjectId } from "./domain-ids";

export const MoveIntent = struct({
  x: f32(),
  y: f32(),
  portalId: i32<ObjectId>(),
});

export const AttackIntent = struct({
  targetEntityId: i32(),
});

export const DamageDealt = struct({
  attackerEntityId: i32(),
  victimEntityId: i32(),
  amount: f32(),
});

export const ActorDied = struct({
  entityId: i32(),
});

export const ActorRespawned = struct({
  entityId: i32(),
});

export const ChatMessage = struct({
  fromEntityId: i32(),
  text: string(),
});

export const ItemPickupIntent = struct({
  entityId: i32(),
  itemInstanceId: string(),
});

export const ItemDropIntent = struct({
  entityId: i32(),
  itemInstanceId: string(),
});

export const AreaChanged = struct({
  entityId: i32(),
  areaId: string<AreaId>(),
});

export const LoginIntent = struct({
  characterId: string<CharacterId>(),
});

export const LogoutHappened = struct({
  entityId: i32(),
});

export const RespawnIntent = struct({});

export const allEvents = [
  MoveIntent,
  AttackIntent,
  DamageDealt,
  ActorDied,
  ActorRespawned,
  ChatMessage,
  ItemPickupIntent,
  ItemDropIntent,
  AreaChanged,
  LoginIntent,
  LogoutHappened,
  RespawnIntent,
];
