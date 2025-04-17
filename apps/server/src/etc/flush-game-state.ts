import type { PatchStateMachine } from "@mp/sync";
import { syncPatchEncoding } from "@mp/sync";
import type { GameState } from "@mp/game/server";
import type { WebSocket } from "@mp/ws/server";
import { getSocketId } from "./get-socket-id";

export function flushGameState(
  state: PatchStateMachine<GameState>,
  clients: Iterable<WebSocket>,
) {
  const patches = state.$flush();
  for (const socket of clients) {
    const clientId = getSocketId(socket);
    const patch = patches.get(clientId);
    if (patch) {
      socket.send(syncPatchEncoding.encode(patch));
    }
  }
}
