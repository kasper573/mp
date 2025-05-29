import type { Vector } from "@mp/math";
import type { Branded, Tile, TimesPerSecond } from "@mp/std";

export type ActorId = Branded<string, "ActorId">;
export type EffectId = Branded<string, "EffectId">;

export interface State {
  actors: Map<ActorId, Actor>;
  effects: Map<EffectId, Effect>;
}

export interface Actor {
  id: ActorId;
  coords: Vector<Tile>;
  stats: Stats;
}

export interface Stats {
  speed: Tile;
  health: number;
  maxHealth: number;
  attackDamage: number;
  attackSpeed: TimesPerSecond;
  attackRange: Tile;
  xp: number;
}

export interface BaseEffect {
  apply: (actor: Actor) => void;
}

export interface TargetedEffect {
  type: "targeted";
  target: ActorId;
  effect: BaseEffect;
}

export interface AreaEffect {
  type: "area";
  target: AreaTarget;
  effect: BaseEffect;
}

export type AreaTarget =
  | { type: "circle"; radius: Tile; center: Vector<Tile> }
  | { type: "rect"; topLeft: Vector<Tile>; bottomRight: Vector<Tile> }
  | { type: "cone"; apex: Vector<Tile>; direction: Vector<Tile>; angle: number }
  | { type: "line"; start: Vector<Tile>; end: Vector<Tile>; width: Tile };

export type Effect = TargetedEffect | AreaEffect;
