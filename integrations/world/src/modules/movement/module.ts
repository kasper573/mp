import { defineModule } from "@rift/modular";
import {
  Facing,
  MoveTarget,
  MovementSpeed,
  Path,
  Position,
} from "../../components";
import { MoveIntent } from "../../events";

export const MovementModule = defineModule({
  server: (ctx) => {
    ctx.rift.on(MoveIntent, () => {
      // TODO: port movement-behavior.ts — set MoveTarget on sender entity
    });

    ctx.onTick(() => {
      // TODO: port movement-behavior tick loop — path-find, step along path, update Position & Facing
      ctx.rift.query(Position, MovementSpeed);
    });

    return { api: {} };
  },
  client: () => {
    return { api: {} };
  },
});

export const _movementComponentsReferenced = [
  Position,
  MoveTarget,
  MovementSpeed,
  Path,
  Facing,
];
