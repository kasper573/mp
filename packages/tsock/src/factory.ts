import type { EventHandler, EventHandlers } from "./module";
import { Module } from "./module";

export class Factory<Context> {
  module<Definition extends EventHandlers<Context>>(
    definition: Definition,
  ): Module<Definition, Context> {
    return new Module(definition);
  }

  event = new EventHandlerFactory<void, Context>();
}

class EventHandlerFactory<Payload, Context> {
  payload<Payload>() {
    return new EventHandlerFactory<Payload, Context>();
  }

  create(
    handler: EventHandler<Payload, Context>,
  ): EventHandler<Payload, Context> {
    return handler;
  }
}
