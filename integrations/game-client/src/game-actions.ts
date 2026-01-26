import type { CharacterId } from "@mp/game-shared";
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
      characterId: assert(this.characterId.get()),
      to,
      // Bonkers workaround because arktype can't handle undefined being passed to optional fields
      // See https://github.com/arktypeio/arktype/issues/1191
      ...(desiredPortalId ? { desiredPortalId } : {}),
    });
  }

  attack(targetId: ActorId) {
    return this.events.character.attack({
      characterId: assert(this.characterId.get()),
      targetId,
    });
  }

  respawn() {
    return this.events.character.respawn(assert(this.characterId.get()));
  }

  recall() {
    return this.events.character.recall(assert(this.characterId.get()));
  }
}
