import type { CoordinateLike } from "./state";

export type AreaMessages = {
  move(payload: CoordinateLike): void;
};
