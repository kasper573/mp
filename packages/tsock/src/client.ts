import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import type { Unsubscribe } from "./shared";
import { id, transports } from "./shared";
import type {
  AnyEventDefinition,
  AnyEventName,
  AnyEventPayload,
  AnyModuleName,
  AnyModules,
  EventPayload,
} from "./module";

export interface CreateClientOptions<Context> {
  url: string;
  context: () => Context;
  log?: typeof console.log;
}

export class Client<Modules extends AnyModules<Context>, Context> {
  private socket: Socket;

  constructor(private options: CreateClientOptions<Context>) {
    this.socket = io(options.url, { transports });
  }

  modules: ModuleInterface<Modules, Context> = {} as ModuleInterface<
    Modules,
    Context
  >;

  send<
    ModuleName extends AnyModuleName<Modules>,
    EventName extends AnyEventName<Modules[ModuleName]>,
  >(
    moduleName: ModuleName,
    eventName: EventName,
    payload: EventPayload<Modules[ModuleName]["events"][EventName]>,
  ): void {
    const context = this.options.context();
    this.options.log?.("send", id(moduleName, eventName), { payload, context });
    this.socket.send(moduleName, eventName, payload, context);
  }

  subscribe<
    ModuleName extends AnyModuleName<Modules>,
    EventName extends AnyEventName<Modules[ModuleName]>,
  >(
    moduleName: ModuleName,
    eventName: EventName,
    handler: (
      payload: EventPayload<Modules[ModuleName]["events"][EventName]>,
    ) => void,
  ): Unsubscribe {
    const { log } = this.options;
    function filter(m: string, e: string, p: AnyEventPayload) {
      log?.("receive", id(m, e), p);
      if (m === moduleName && e === eventName) {
        handler(p as EventPayload<Modules[ModuleName]["events"][EventName]>);
      }
    }
    this.socket.onAny(filter);
    return () => this.socket.offAny(filter);
  }
}

type ModuleInterface<Modules extends AnyModules<Context>, Context> = {
  [ModuleName in AnyModuleName<Modules>]: {
    [EventName in AnyEventName<Modules[ModuleName]>]: EventInterface<
      Modules[ModuleName]["events"][EventName],
      Context
    >;
  };
};

type EventInterface<Event extends AnyEventDefinition<Context>, Context> = {
  (payload: EventPayload<Event>): void;
  subscribe(handler: (payload: EventPayload<Event>) => void): Unsubscribe;
};
