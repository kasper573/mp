import { EventEmitter } from "events";
import { t } from "../definition/tsock";

export interface Message {
  from: string;
  contents: string;
}

export function createExampleRouter() {
  const bus = new EventEmitter();

  function broadcast(message: Message) {
    console.log("Broadcasting message", message);
    bus.emit("message", message);
  }

  return t.router({
    say: t.event.payload<string>().create(({ context, payload }) => {
      broadcast({ from: context.clientId, contents: payload });
    }),
    chat: t.event.payload<Message>().create(({ context }) => {
      broadcast({ from: context.clientId, contents: "connected" });
      return () => {
        broadcast({ from: context.clientId, contents: "disconnected" });
      };
    }),
  });
}
