import { object } from "@rift/types";
import { TileVector } from "./components";

export const MoveRequest = object({
  target: TileVector,
});

export const movementEvents = [MoveRequest] as const;
