import { object, string, u16, u32 } from "@rift/types";
import type { RiftCloseCode } from "./transport";

export type Branded<T, Name extends string> = T & { readonly __brand: Name };

export type EntityId = Branded<number, "EntityId">;
export type ClientId = Branded<number, "ClientId">;

export enum Opcode {
  Hello = 0x01,
  Accept = 0x02,
  Delta = 0x03,
  EventFromClient = 0x10,
  EventToClient = 0x11,
}

export enum DeltaOp {
  EntityCreated = 0x01,
  EntityDestroyed = 0x02,
  ComponentAdded = 0x03,
  ComponentRemoved = 0x04,
  ComponentUpdated = 0x05,
}

export const Tick = object({
  tick: u32(),
  dt: u32(),
});

export const DeltaApplied = object({
  tick: u32(),
  timeMs: u32(),
});

export const ClientConnected = object({
  clientId: u32<ClientId>(),
});

export const ClientDisconnected = object({
  clientId: u32<ClientId>(),
  // oxlint-disable-next-line typescript/no-unnecessary-type-arguments
  code: u16<RiftCloseCode>(),
  reason: string(),
});
