import { attack } from "./events/attack";
import { characterWantsToJoinArea } from "./events/characterWantsToJoinArea";
import { kill } from "./events/kill";
import { move } from "./events/move";
import { requestFullState } from "./events/requestFullState";
import { respawn } from "./events/respawn";
import { evt } from "./integrations/event-router";

export type GameServiceEvents = typeof gameServiceEvents;
export const gameServiceEvents = evt.router({
  character: evt.router({
    attack: attack,
    kill: kill,
    move: move,
    respawn: respawn,
  }),
  network: evt.router({
    characterWantsToJoinArea,
    requestFullState,
  }),
});
