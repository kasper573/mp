import type { Vec2 } from "./Vec2";

export interface Entity {
  id: string;
  name: string;
  position: Vec2;
  targetPosition: Vec2;
  speed: number;
}
