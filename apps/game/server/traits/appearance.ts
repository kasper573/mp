import { varchar } from "@mp/db";
import { InjectionContext } from "@mp/ioc";
import type { Rect } from "@mp/math";
import type { Branded, PublicUrl, Tile } from "@mp/std";

export interface AppearanceTrait {
  color?: number; // HEX
  opacity?: number; // 0-1
  modelId: ActorModelId;
  name: string;
}

export function actorModelId() {
  return varchar({ length: 64 }).$type<ActorModelId>();
}

export interface ActorModel {
  id: ActorModelId;
  spritesheets: ReadonlyMap<ActorModelState, PublicUrl>;
  hitBox: Rect<Tile>;
}

export type ActorModelLookup = ReadonlyMap<ActorModelId, ActorModel>;

export const ctxActorModelLookup =
  InjectionContext.new<ActorModelLookup>("ActorModelLookup");

export type ActorModelId = Branded<string, "ActorModelId">;

export type ActorModelState = (typeof actorModelStates)[number];

export const actorModelStates = Object.freeze([
  "attack-shooting",
  "attack-spear",
  "dash-dust",
  "dash-gun",
  "dash-normal",
  "dash-shadow",
  "dash-spear",
  "death-gun",
  "death-normal",
  "death-shadow-gun",
  "death-shadow-normal",
  "death-shadow-spear",
  "death-spear",
  "idle-gun",
  "idle-normal",
  "idle-spear",
  "jump-dust",
  "jump-gun",
  "jump-normal",
  "jump-shadow",
  "jump-spear",
  "reloading",
  "run-gun",
  "run-normal",
  "run-shooting",
  "run-spear",
  "shadow",
  "walk-aiming",
  "walk-gun",
  "walk-normal",
  "walk-reloading",
  "walk-shooting",
  "walk-spear",
] as const);
