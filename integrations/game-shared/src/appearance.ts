import type { ActorModelId } from "@mp/db/types";
import type { Rect } from "@mp/math";
import type { Tile } from "@mp/std";
import { object, prop } from "@mp/sync";

export const AppearanceTrait = object({
  color: prop<number | undefined>(),
  opacity: prop<number | undefined>(),
  modelId: prop<ActorModelId>(),
  name: prop<string>(),
});
export type AppearanceTrait = typeof AppearanceTrait.$infer;

export interface ActorModel {
  id: ActorModelId;
  hitBox: Rect<Tile>;
}

export type ActorModelLookup = ReadonlyMap<ActorModelId, ActorModel>;

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

export function isActorModelState(str: string): str is ActorModelState {
  return actorModelStatesSet.has(str as ActorModelState);
}

const actorModelStatesSet = new Set(actorModelStates);
