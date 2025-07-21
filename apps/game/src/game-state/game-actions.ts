import type { Vector } from "@mp/math";
import type { Signal } from "@mp/state";
import { type Tile, assert } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";
import type { GameEventClient } from "../network/game-event-client";
import type { CharacterId } from "../character/types";
import type { ActorId } from "../actor/actor";

export class GameActions {
  constructor(
    private rpc: GameEventClient,
    private characterId: Signal<CharacterId | undefined>,
  ) {}

  move(to: Vector<Tile>, desiredPortalId?: ObjectId) {
    return this.rpc.character.move({
      characterId: assert(this.characterId.value),
      to,
      desiredPortalId,
    });
  }

  attack(targetId: ActorId) {
    return this.rpc.character.attack({
      characterId: assert(this.characterId.value),
      targetId,
    });
  }

  respawn() {
    return this.rpc.character.respawn(assert(this.characterId.value));
  }

  join() {
    this.rpc.world.join();
  }
}
