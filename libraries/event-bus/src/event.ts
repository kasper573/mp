class EventDefinitionBuilder<Type extends string, Payload> {
  constructor(private type: Type) {}

  payload<NewPayload>(): EventDefinitionBuilder<Type, NewPayload> {
    return new EventDefinitionBuilder<Type, NewPayload>(this.type);
  }

  build(): EventDefinition<Type, Payload> {
    const fn = (payload: Payload) => ({ type: this.type, payload });

    fn.match = (
      event: AnyEvent,
    ): event is DiscriminatedEvent<Type, Payload> => {
      return event.type === this.type;
    };

    fn.type = this.type;

    return fn;
  }
}

export interface EventDefinition<Type extends string, Payload> {
  readonly type: Type;
  /**
   * Creates an event instance with the given arguments.
   */
  (payload: Payload): DiscriminatedEvent<Type, Payload>;

  /**
   * Type guard to check if an event is of this definition's type.
   */
  match(event: AnyEvent): event is DiscriminatedEvent<Type, Payload>;
}

export type AnyEvent = DiscriminatedEvent<string, unknown>;

export interface DiscriminatedEvent<Type extends string, Payload> {
  type: Type;
  payload: Payload;
}

export function event<Type extends string>(
  type: Type,
): EventDefinitionBuilder<Type, void> {
  return new EventDefinitionBuilder<Type, void>(type);
}
