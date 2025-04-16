import type { ClientId } from "@mp/game/server";
import type { WebSocket } from "@mp/ws/server";
import { nanoid } from "nanoid";

export function getSocketId(socket: WebSocket): ClientId {
  let id = Reflect.get(socket, idSymbol) as ClientId | undefined;
  if (id === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    id = nanoid() as ClientId;
    Reflect.set(socket, idSymbol, id);
  }
  return id;
}

const idSymbol = Symbol("socketId");
