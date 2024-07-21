import type { Entity } from "./Entity";

export interface World {
  entities: Map<Entity["id"], Entity>;
}
