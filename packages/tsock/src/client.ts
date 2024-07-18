import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import type { Unsubscribe } from "./shared";
import { transports } from "./shared";
import type {
  AnyEventName,
  AnyModule,
  AnyModuleName,
  AnyModules,
  EventPayload,
} from "./module";

export interface CreateClientOptions<Context> {
  url: string;
  context: () => Context;
}

export class Client<Modules extends AnyModules<Context>, Context> {
  private socket: Socket;

  constructor(private options: CreateClientOptions<Context>) {
    this.socket = io(options.url, { transports });
  }

  send<
    ModuleName extends AnyModuleName<Modules>,
    EventName extends AnyEventName<Modules[ModuleName]>,
  >(
    moduleName: ModuleName,
    eventName: EventName,
    payload: EventPayload<Modules[ModuleName], EventName>,
  ): void {
    this.socket.send(moduleName, eventName, payload, this.options.context());
  }

  subscribe<
    ModuleName extends AnyModuleName<Modules>,
    EventName extends AnyEventName<Modules[ModuleName]>,
  >(
    moduleName: ModuleName,
    eventName: EventName,
    handler: (payload: EventPayload<Modules[ModuleName], EventName>) => void,
  ): Unsubscribe {
    function filter(m: string, e: string, p: EventPayload<AnyModule, string>) {
      if (m === moduleName && e === eventName) {
        handler(p as EventPayload<Modules[ModuleName], EventName>);
      }
    }
    this.socket.onAny(filter);
    return () => this.socket.offAny(filter);
  }
}
