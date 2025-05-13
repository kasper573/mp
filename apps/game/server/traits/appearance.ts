import type { Branded } from "@mp/std";

export interface AppearanceTrait {
  color?: number; // HEX
  opacity?: number; // 0-1
  modelId: ActorModelId;
  name: string;
}

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
