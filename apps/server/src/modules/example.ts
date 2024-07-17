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
    say: t.operation.input<string>().create(({ context, input }) => {
      broadcast({ from: context.clientId, contents: input });
    }),
    chat: t.operation.input<Message>().create(({ context, emit }) => {
      bus.on("message", emit.next);
      broadcast({ from: context.clientId, contents: "connected" });
      return () => {
        broadcast({ from: context.clientId, contents: "disconnected" });
        bus.off("message", emit.next);
      };
    }),
  });
}
