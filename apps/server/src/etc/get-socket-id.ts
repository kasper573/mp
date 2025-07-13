import type { ClientId } from "@mp/game";
import { createShortId } from "@mp/std";
import type { WebSocket } from "@mp/ws/server";

export function getSocketId(socket: WebSocket): ClientId {
  let id = Reflect.get(socket, idSymbol) as ClientId | undefined;
  if (id === undefined) {
    id = createShortId() as ClientId;
    Reflect.set(socket, idSymbol, id);
  }
  return id;
}

const idSymbol = Symbol("socketId");
