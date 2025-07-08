import type { Vector } from "@mp/math";
import type { Observable } from "@mp/state";
import { type Tile, assert } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";
import type { CharacterId, ActorId } from "../../server";
import type { GameRpcClient } from "../game-rpc-client";

export type GameActions = ReturnType<typeof createGameActions>;

export function createGameActions(
  rpc: GameRpcClient,
  characterId: () => Observable<CharacterId | undefined>,
) {
  const move = (to: Vector<Tile>, desiredPortalId?: ObjectId) => {
    return rpc.character.move({
      characterId: assert(characterId().$getObservableValue()),
      to,
      desiredPortalId,
    });
  };

  const attack = (targetId: ActorId) =>
    rpc.character.attack({
      characterId: assert(characterId().$getObservableValue()),
      targetId,
    });

  const respawn = () =>
    rpc.character.respawn(assert(characterId().$getObservableValue()));

  const join = async () => {
    const char = await rpc.world.join();
    characterId().set(char.id);
    return char;
  };

  return {
    respawn,
    join,
    move,
    attack,
  };
}
