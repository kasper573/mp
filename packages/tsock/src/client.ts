import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { Logger } from "./logger";
import type {
  AnyEventDefinition,
  AnyEventRecord,
  AnyModuleDefinitionRecord,
  EventDefinition,
  ModuleEvents,
  ModuleRecord,
} from "./module";
import { createEventBus } from "./event";

export { Logger };

export interface ClientOptions<Context> {
  url: string;
  context: () => Context;
  logger?: Logger;
}

export class Client<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  Context,
> {
  private socket: Socket;
  modules: ModuleRecord<ClientModuleDefinitionRecord<ModuleDefinitions>>;

  constructor(private options: ClientOptions<Context>) {
    this.socket = io(options.url, { transports: ["websocket"] });
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
  const logger = options.logger?.chain(moduleName);
  return createEventBus<
    ModuleEvents<ClientEventDefinitionRecord<AnyEventRecord>>,
    ModuleEvents<ClientEventDefinitionRecord<AnyEventRecord>>
  >(
    (eventName, payload) => {
      logger?.chain(eventName).info(">>", payload);
      socket.send(moduleName, eventName, payload, options.context());
    },
    (handler) => {
      function handlerWithLogging(
        _: string,
        eventName: string,
        payload: unknown,
      ) {
        logger?.chain(eventName).info("<<", payload);
        return handler(eventName, payload);
      }
      socket.onAny(handlerWithLogging);
      return () => socket.offAny(handlerWithLogging);
    },
  );
}

type ClientModuleDefinitionRecord<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
> = {
  [ModuleName in keyof ModuleDefinitions]: ClientEventDefinitionRecord<
    ModuleDefinitions[ModuleName]
  >;
};

type ClientEventDefinitionRecord<Events extends AnyEventRecord> = {
  [EventName in keyof Events]: ClientEventDefinition<Events[EventName]>;
};

type ClientEventDefinition<Event extends AnyEventDefinition> =
  Event extends EventDefinition<infer Type, infer Arg>
    ? EventDefinition<Type, Arg["payload"]>
    : never;
