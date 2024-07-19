import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { id, transports } from "./shared";
import type {
  AnyEventDefinition,
  AnyModuleDefinitionRecord,
  EventHandler,
  ModuleRecord,
} from "./module";
import { createEventBus } from "./EventBus";

export interface ClientOptions<Context> {
  url: string;
  context: () => Context;
  log?: typeof console.log;
}

export class Client<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  Context,
> {
  private socket: Socket;
  modules: ModuleRecord<HideServerContext<ModuleDefinitions>>;

  constructor(private options: ClientOptions<Context>) {
    this.socket = io(options.url, { transports });
    this.modules = createModuleInterface<ModuleDefinitions, Context>(
      this.socket,
      this.options,
    );
  }
}

function createModuleInterface<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  Context,
>(
  socket: Socket,
  options: ClientOptions<Context>,
): ModuleRecord<ModuleDefinitions> {
  return new Proxy({} as ModuleRecord<ModuleDefinitions>, {
    get: (_, moduleName) => createModuleEventBus(moduleName, socket, options),
  });
}

function createModuleEventBus<Context>(
  moduleName: PropertyKey,
  socket: Socket,
  options: ClientOptions<Context>,
) {
  return createEventBus(
    (...args) => {
      const [eventName, payload] = args;
      const context = options.context();
      options.log?.("send", id(moduleName, eventName), {
        payload,
        context,
      });
      socket.send(moduleName, eventName, payload, context);
    },
    (handler) => {
      function handlerWithLogging(
        moduleName: string,
        eventName: string,
        payload: unknown,
      ) {
        options.log?.("receive", id(moduleName, eventName), payload);
        return handler(eventName, payload);
      }
      socket.onAny(handlerWithLogging);
      return () => socket.offAny(handlerWithLogging);
    },
  );
}

type HideServerContext<ModuleDefinitions extends AnyModuleDefinitionRecord> = {
  [ModuleName in keyof ModuleDefinitions]: {
    [EventName in keyof ModuleDefinitions[ModuleName]]: ClientEventDefinition<
      ModuleDefinitions[ModuleName][EventName]
    >;
  };
};

type ClientEventDefinition<Event extends AnyEventDefinition> = {
  type: Event["type"];
  handler: EventHandler<OmitContext<Parameters<Event["handler"]>>>;
};

// Context is the last parameter
type OmitContext<T extends unknown[]> = T extends [...infer Head, unknown]
  ? Head
  : never;
