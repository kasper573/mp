import type { Temporal } from "./Temporal";
import type { Vec2 } from "./Vec2";

export interface Entity {
  id: string;
  name: string;
  position: Temporal<Vec2>;
  speed: number;
}
