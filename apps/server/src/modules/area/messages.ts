import type { CoordinateLike } from "./schema";

export type AreaMessages = {
  move(payload: CoordinateLike): void;
};
