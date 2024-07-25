import type { CoordinateLike } from "./state";

export type ServerMessages = {
  move(payload: CoordinateLike): void;
};
