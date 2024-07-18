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

export interface ClientOptions<Context> {
  url: string;
  context: () => Context;
  log?: typeof console.log;
}

export class Client<Modules extends AnyModules<Context>, Context> {
  private socket: Socket;
  modules: ModuleInterface<Modules, Context>;

  constructor(private options: ClientOptions<Context>) {
    this.socket = io(options.url, { transports });
    this.modules = createModuleInterface<Modules, Context>(
      this.socket,
      this.options,
    );
  }
}

function createModuleInterface<Modules extends AnyModules<Context>, Context>(
  socket: Socket,
  options: ClientOptions<Context>,
): ModuleInterface<Modules, Context> {
  const proxy = new Proxy(empty, {
    get: (_, moduleName) =>
      new Proxy(empty, {
        get: (_, eventName) =>
          createEventInterface(moduleName, eventName, socket, options),
      }),
  });

  return proxy as ModuleInterface<Modules, Context>;
}

function createEventInterface<Context>(
  moduleName: PropertyKey,
  eventName: PropertyKey,
  socket: Socket,
  options: ClientOptions<Context>,
): EventInterface<AnyEventDefinition, Context> {
  function invoke(payload: AnyEventPayload): void {
    const context = options.context();
    options.log?.("send", id(moduleName, eventName), { payload, context });
    socket.send(moduleName, eventName, payload, context);
  }

  invoke.subscribe = function (handler: (payload: AnyEventPayload) => void) {
    const { log } = options;
    function filter(m: string, e: string, p: AnyEventPayload) {
      log?.("receive", id(m, e), p);
      if (m === moduleName && e === eventName) {
        handler(p);
      }
    }
    socket.onAny(filter);
    return () => socket.offAny(filter);
  };

  return invoke;
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

const empty = Object.freeze({});
