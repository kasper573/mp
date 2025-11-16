import type { EventBus } from "./bus";
import type { AnyEvent, EventDefinition } from "./event";

export class EventTracker {
  #seen = new Map<AnyEvent["type"], AnyEvent["payload"][]>();

  track<State>(bus: EventBus<State>) {
    return bus.onAny(this.onEvent);
  }

  private onEvent = (event: AnyEvent): void => {
    const events = this.#seen.get(event.type);
    if (events) {
      events.push(event.payload);
    } else {
      this.#seen.set(event.type, [event.payload]);
    }
  };

  clear(): void {
    this.#seen.clear();
  }

  seen<Name extends string, Payload>(
    def: EventDefinition<Name, Payload>,
  ): readonly Payload[] {
    const payloads = this.#seen.get(def.type) ?? emptyArray;
    return payloads as Payload[];
  }
}

const emptyArray = Object.freeze([]);
