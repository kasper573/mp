import { copy } from "@rift/types";
import { TileVector } from "./components";

export const MoveRequest = copy(TileVector);

export const movementEvents = [MoveRequest] as const;
