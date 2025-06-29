import type { Vector } from "@mp/math";
import type { Atom } from "@mp/state";
import { type Tile, assert } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";
import type { CharacterId, ActorId } from "../../server";
import type { GameSolidRpcInvoker } from "../use-rpc";

export function createGameActions(
  rpc: GameSolidRpcInvoker,
  characterId: () => Atom<CharacterId | undefined>,
) {
  const move = (to: Vector<Tile>, desiredPortalId?: ObjectId) => {
    return rpc.character.move({
      characterId: assert(characterId().get()),
      to,
      desiredPortalId,
    });
  };

  const attack = (targetId: ActorId) =>
    rpc.character.attack({
      characterId: assert(characterId().get()),
      targetId,
    });

  const respawn = () => rpc.character.respawn(assert(characterId().get()));

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
