import type { Entity } from "./entity";

export interface Scene {
  entities: Map<Entity["id"], Entity>;
}
