import type { Vector } from "@mp/math";
import type { Signal } from "@mp/state";
import { type Tile, assert } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";
import type { CharacterId, ActorId } from "../../server";
import type { GameRpcClient } from "../game-rpc-client";

export class GameActions {
  constructor(
    private rpc: GameRpcClient,
    private characterId: Signal<CharacterId | undefined>,
  ) {}

  move(to: Vector<Tile>, desiredPortalId?: ObjectId) {
    return this.rpc.character.move({
      characterId: assert(this.characterId.get()),
      to,
      desiredPortalId,
    });
  }

  attack(targetId: ActorId) {
    return this.rpc.character.attack({
      characterId: assert(this.characterId.get()),
      targetId,
    });
  }

  respawn() {
    return this.rpc.character.respawn(assert(this.characterId.get()));
  }

  async join() {
    const char = await this.rpc.world.join();
    this.characterId.set(char.id);
    return char;
  }
}
