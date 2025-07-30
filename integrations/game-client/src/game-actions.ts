import type { CharacterId } from "@mp/db/types";
import type { GameEventClient } from "@mp/game-service";
import type { ActorId } from "@mp/game-shared";
import type { Vector } from "@mp/math";
import type { Signal } from "@mp/state";
import { type Tile, assert } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";

export class GameActions {
  constructor(
    private events: GameEventClient,
    private characterId: Signal<CharacterId | undefined>,
  ) {}

  move(to: Vector<Tile>, desiredPortalId?: ObjectId) {
    return this.events.character.move({
      characterId: assert(this.characterId.value),
      to,
      desiredPortalId,
    });
  }

  attack(targetId: ActorId) {
    return this.events.character.attack({
      characterId: assert(this.characterId.value),
      targetId,
    });
  }

  respawn() {
    return this.events.character.respawn(assert(this.characterId.value));
  }
}
