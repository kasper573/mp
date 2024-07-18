import type {
  EventDefinition,
  EventHandler,
  EventType,
  EventDefinitionRecord,
} from "./module";
import { Module } from "./module";

export class Factory<Context> {
  module<Definition extends EventDefinitionRecord<Context>>(
    definition: Definition,
  ): Module<Definition, Context> {
    return new Module(definition);
  }

  event = new EventFactory<"bidirectional", void, Context>("bidirectional");
}

class EventFactory<Type extends EventType, Payload, Context> {
  constructor(private _type: Type) {}

  payload<Payload>() {
    return new EventFactory<Type, Payload, Context>(this._type);
  }

  type<NewType extends EventType>(newType: NewType) {
    return new EventFactory<NewType, Payload, Context>(newType);
  }

  create(
    handler: EventHandler<Payload, Context> = () => {},
  ): EventDefinition<Type, Payload, Context> {
    return { type: this._type, handler, __payloadType__: null as Payload };
  }
}
