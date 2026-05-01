import { Rect } from "@mp/math";
import type { Tile } from "@mp/std";
import type { ActorModelId } from "./ids";

export interface ActorModel {
  readonly id: ActorModelId;
  readonly hitBox: Rect<Tile>;
}

export type ActorModelLookup = ReadonlyMap<ActorModelId, ActorModel>;

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

export type ActorModelState = (typeof actorModelStates)[number];

const actorModelStatesSet = new Set<string>(actorModelStates);

export function isActorModelState(str: string): str is ActorModelState {
  return actorModelStatesSet.has(str);
}

const adventurerHitBox = new Rect(
  -0.5 as Tile,
  -1.5 as Tile,
  1 as Tile,
  2 as Tile,
);

export const actorModels: ReadonlyArray<ActorModel> = [
  { id: "adventurer" as ActorModelId, hitBox: adventurerHitBox },
];

export const actorModelsById: ReadonlyMap<ActorModelId, ActorModel> = new Map(
  actorModels.map((m) => [m.id, m]),
);
