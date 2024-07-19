import type {
  EventDefinition,
  EventHandler,
  EventType,
  AnyEventRecord,
  Module,
} from "./module";
import { createModule } from "./module";

export class Factory<Context> {
  module<Events extends AnyEventRecord>(events: Events): Module<Events> {
    return createModule(events);
  }

  event = new ModuleEventFactory<"bidirectional", void, Context>(
    "bidirectional",
  );
}

class ModuleEventFactory<Type extends EventType, Payload, Context> {
  constructor(private _type: Type) {}

  payload<Payload>() {
    return new ModuleEventFactory<Type, Payload, Context>(this._type);
  }

  type<NewType extends EventType>(newType: NewType) {
    return new ModuleEventFactory<NewType, Payload, Context>(newType);
  }

  create(
    handler: EventHandler<{ payload: Payload; context: Context }> = () => {},
  ): EventDefinition<Type, { payload: Payload; context: Context }> {
    return { type: this._type, handler };
  }
}
