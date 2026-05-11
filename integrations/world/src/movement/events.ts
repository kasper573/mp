import { copy, object, u32 } from "@rift/types";
import type { ObjectId } from "@mp/tiled-loader";
import { TileVector } from "../primitives";

export const MoveRequest = copy(TileVector);

export const MoveToPortal = object({
  portalId: u32<ObjectId>(),
  movement: MoveRequest,
});

export const movementEvents = [MoveRequest, MoveToPortal] as const;
