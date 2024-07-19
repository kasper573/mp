import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { id, transports } from "./shared";
import type {
  AnyEventName,
  AnyModule,
  AnyModuleName,
  AnyModules,
  EventPayload,
} from "./module";
import type { Subscribers } from "./EventBus";
import { createEventBus, type EventBus } from "./EventBus";

export interface ClientOptions<Context> {
  url: string;
  context: () => Context;
  log?: typeof console.log;
}

export class Client<Modules extends AnyModules<Context>, Context> {
  private socket: Socket;
  modules: ModuleInterface<Modules>;

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
): ModuleInterface<Modules> {
  return new Proxy({} as ModuleInterface<Modules>, {
    get: (_, moduleName) => createModuleEventBus(moduleName, socket, options),
  });
}

function createModuleEventBus<Context>(
  moduleName: PropertyKey,
  socket: Socket,
  options: ClientOptions<Context>,
): ModuleEventBus<AnyModule> {
  return createEventBus(
    new Proxy({} as ModuleEvents<AnyModule>, {
      get: (_, eventName) => (payload: unknown) => {
        const context = options.context();
        options.log?.("send", id(moduleName, eventName), {
          payload,
          context,
        });
        socket.send(moduleName, eventName, payload, context);
      },
    }),
    new Proxy({} as Subscribers<ModuleEvents<AnyModule>>, {
      get: (_, eventName) => (handler: (payload: unknown) => void) => {
        const { log } = options;
        function filter(m: string, e: string, p: unknown) {
          log?.("receive", id(m, e), p);
          if (m === moduleName && e === eventName) {
            handler(p);
          }
        }
        socket.onAny(filter);
        return () => socket.offAny(filter);
      },
    }),
  );
}

type ModuleInterface<Modules extends AnyModules> = {
  [ModuleName in AnyModuleName<Modules>]: ModuleEventBus<Modules[ModuleName]>;
};

type ModuleEventBus<Module extends AnyModule> = EventBus<
  ModuleEvents<Module>,
  ModuleEvents<Module>
>;

type ModuleEvents<Module extends AnyModule> = {
  [EventName in AnyEventName<Module>]: (
    payload: EventPayload<Module["events"][EventName]>,
  ) => void;
};
