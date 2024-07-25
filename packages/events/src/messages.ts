export function messageSender<EventHandlers extends AnyEvents>(
  target: SenderLike,
): MessageSender<EventHandlers> {
  return target as unknown as MessageSender<EventHandlers>;
}

export function messageReceiver<EventHandlers extends AnyEvents>() {
  return function create<Client>(
    target: ReceiverLike<Client>,
  ): MessageReceiver<Client, EventHandlers> {
    return target as unknown as MessageReceiver<Client, EventHandlers>;
  };
}

interface SenderLike {
  send(eventName: string, payload: unknown): void;
}

interface ReceiverLike<Client> {
  onMessage(
    eventName: string,
    eventHandler: (client: Client, payload: unknown) => void,
  ): () => void;
}

export interface MessageSender<Events extends AnyEvents> {
  send<E extends keyof Events>(
    eventName: E,
    ...args: Parameters<Events[E]>
  ): void;
}

export interface MessageReceiver<Client, Events extends AnyEvents> {
  onMessage<E extends keyof Events>(
    eventName: E,
    eventHandler: (client: Client, ...args: Parameters<Events[E]>) => void,
  ): () => void;
}

type AnyEvents<EventName extends string = string> = Record<
  EventName,
  (...args: never[]) => void
>;
