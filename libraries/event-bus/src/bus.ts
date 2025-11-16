import type { EventDefinition, AnyEvent, DiscriminatedEvent } from "./event";

export class EventBus<State> {
  private handlers = new Set<AnyEventBusHandler<State>>();

  /**
   * @param state State that should be accessible to event handlers.
   */
  constructor(public state: State) {}

  /**
   * Syntax sugar for registering an event handler for a specific event definition.
   * Calls `onAny` under the hood.
   */
  on<Type extends string, Payload>(
    def: EventDefinition<Type, Payload>,
    handler: EventBusHandler<DiscriminatedEvent<Type, Payload>, State>,
  ): UnsubscribeFn {
    return this.onAny((event) => {
      if (def.match(event)) {
        handler(event, this.state, this);
      }
    });
  }

  onAny(handler: AnyEventBusHandler<State>): UnsubscribeFn {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(event: AnyEvent): void {
    for (const handler of this.handlers) {
      handler(event, this.state, this);
    }
  }
}

type UnsubscribeFn = () => void;

type AnyEventBusHandler<State> = EventBusHandler<AnyEvent, State>;

type EventBusHandler<Event extends AnyEvent, State> = (
  event: Event,
  state: State,
  bus: EventBus<State>,
) => void;
