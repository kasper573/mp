import type {
  EventDefinition,
  EventHandler,
  EventOrigin,
  AnyEventRecord,
  Module,
  EventHandlerArg,
} from "./module";
import { createModule } from "./module";

export class Factory<Context> {
  module<Events extends AnyEventRecord>(events: Events): Module<Events> {
    return createModule(events);
  }

  event = new ModuleEventFactory<"client", void, Context>("client");
}

class ModuleEventFactory<Origin extends EventOrigin, Payload, Context> {
  constructor(private _origin: Origin) {}

  payload<Payload>() {
    return new ModuleEventFactory<Origin, Payload, Context>(this._origin);
  }

  origin<NewOrigin extends EventOrigin>(newOrigin: NewOrigin) {
    return new ModuleEventFactory<NewOrigin, Payload, Context>(newOrigin);
  }

  create(
    handler: EventHandler<EventHandlerArg<Payload, Context>> = noop,
  ): EventDefinition<Origin, EventHandlerArg<Payload, Context>> {
    return { origin: this._origin, handler: handler };
  }
}

const noop = () => {};
