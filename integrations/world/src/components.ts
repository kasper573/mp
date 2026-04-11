import {
  array,
  f32,
  i32,
  optional,
  string,
  struct,
  tag,
  transform,
  type RiftType,
} from "@rift/core";
import { Vector } from "@mp/math";
import type { AreaId, CardinalDirection } from "./domain-ids";
import type {
  ActorModelId,
  CharacterId,
  InventoryId,
  NpcDefinitionId,
  NpcInstanceId,
  NpcSpawnId,
  NpcType,
  ObjectId,
  UserId,
} from "./domain-ids";

function vec2(): RiftType<Vector<number>> {
  return transform(struct({ x: f32(), y: f32() }), {
    encode: (v: Vector<number>) => ({ x: v.x, y: v.y }),
    decode: ({ x, y }) => new Vector(x, y),
  });
}

const Vec2 = vec2();
const RectStruct = struct({
  x: f32(),
  y: f32(),
  width: f32(),
  height: f32(),
});

export const Position = vec2();
export const MoveTarget = vec2();
export const MovementSpeed = struct({ speed: f32() });
export const Path = array(Vec2);
export const Facing = struct({ dir: string<CardinalDirection>() });
export const DesiredPortal = struct({ portalId: string<ObjectId>() });

export const HitBox = RectStruct;
export const Health = struct({
  current: f32(),
  max: f32(),
});
export const Alive = tag();
export const AttackStats = struct({
  damage: f32(),
  speed: f32(),
  range: f32(),
});
export const AttackTarget = struct({ entityId: i32() });
export const LastAttack = struct({ atMs: f32() });

export const Appearance = struct({
  name: string(),
  modelId: string<ActorModelId>(),
  color: i32(),
  opacity: f32(),
});

export const PlayerControlled = tag();
export const NpcActor = tag();

export const CharacterMeta = struct({
  characterId: string<CharacterId>(),
  userId: string<UserId>(),
  inventoryId: string<InventoryId>(),
  xp: f32(),
});

export const NpcMeta = struct({
  instanceId: string<NpcInstanceId>(),
  definitionId: string<NpcDefinitionId>(),
  spawnId: string<NpcSpawnId>(),
  npcType: string<NpcType>(),
  aggroRange: f32(),
});

export const Patrol = struct({ path: array(Vec2) });

export const AreaMember = struct({ areaId: string<AreaId>() });

export const ClientSession = struct({ clientId: string() });

export const allComponents = [
  Position,
  MoveTarget,
  MovementSpeed,
  Path,
  Facing,
  DesiredPortal,
  HitBox,
  Health,
  Alive,
  AttackStats,
  AttackTarget,
  LastAttack,
  Appearance,
  PlayerControlled,
  NpcActor,
  CharacterMeta,
  NpcMeta,
  Patrol,
  AreaMember,
  ClientSession,
];

export { Vec2 };
export const OptionalVec2 = optional(Vec2);
