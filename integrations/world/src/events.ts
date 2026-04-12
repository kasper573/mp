import { struct, f32, u32, tag } from "@rift/core";

// Client → Server
export const MoveCommand = struct({ x: f32(), y: f32() });
export const AttackCommand = struct({ targetId: u32() });
export const RespawnCommand = tag();
export const RecallCommand = tag();

// Server → Client
export const SessionAssigned = struct({ entityId: u32() });
export const AttackAnimation = struct({ attackerId: u32(), targetId: u32() });
export const DeathAnimation = struct({ entityId: u32() });

export const allEvents = [
  MoveCommand,
  AttackCommand,
  RespawnCommand,
  RecallCommand,
  SessionAssigned,
  AttackAnimation,
  DeathAnimation,
];
