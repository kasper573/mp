import { applyPatch } from "rfc6902";
import type {
  StateHandler,
  HandshakeData,
  Unsubscribe,
  EventHandler,
  StateMutation,
} from "./shared";
import {
  createUrlWithHandshakeData,
  decodeServerToClientMessage,
} from "./shared";

export class SyncClient<State extends object> {
  private socket?: WebSocket;

  private stateHandlers = new Set<StateHandler<State>>();
  private readyStateHandlers = new Set<EventHandler<SyncClientReadyState>>();
  private errorHandlers = new Set<EventHandler<Event>>();
  private isEnabled = false;
  private connectAttempt = 0;

  constructor(
    private url: string,
    private getHandshakeData: () => HandshakeData,
    private reconnectDelay = (attemptNumber: number) =>
      1000 * Math.min(Math.pow(2, attemptNumber - 1), 10),
  ) {}

  getReadyState = (): SyncClientReadyState =>
    coerceReadyState(this.socket?.readyState as WebSocketReadyState);

  start = () => {
    this.isEnabled = true;
    this.connect();
  };

  stop = () => {
    this.isEnabled = false;
    this.disconnect();
  };

  subscribeToState = (handler: StateHandler<State>): Unsubscribe => {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  };

  subscribeToReadyState = (
    handler: EventHandler<SyncClientReadyState>,
  ): Unsubscribe => {
    this.readyStateHandlers.add(handler);
    return () => this.readyStateHandlers.delete(handler);
  };

  subscribeToErrors = (handler: EventHandler<Event>): Unsubscribe => {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  };

  private connect() {
    if (this.socket) {
      throw new Error("Socket already created");
    }

    this.connectAttempt++;
    this.socket = new WebSocket(
      createUrlWithHandshakeData(this.url, this.getHandshakeData()),
    );

    this.emitReadyState();

    this.socket.addEventListener("open", this.handleOpen);
    this.socket.addEventListener("close", this.handleClose);
    this.socket.addEventListener("error", this.handleError);
    this.socket.addEventListener(
      "message",
      this.handleMessage as EventHandler<MessageEvent>,
    );
  }

  private disconnect() {
    if (!this.socket) {
      return;
    }

    this.socket.close();
    this.socket.removeEventListener("open", this.handleOpen);
    this.socket.removeEventListener("close", this.handleClose);
    this.socket.removeEventListener("error", this.handleError);
    this.socket.removeEventListener(
      "message",
      this.handleMessage as EventHandler<MessageEvent>,
    );
    this.socket = undefined;
  }

  private enqueueReconnect() {
    setTimeout(() => {
      if (this.isEnabled && !this.socket) {
        this.connect();
      }
    }, this.reconnectDelay(this.connectAttempt));
  }

  private handleOpen = () => {
    this.connectAttempt = 0;
    this.emitReadyState();
  };

  private handleClose = () => {
    this.emitReadyState();
    this.disconnect();
    this.enqueueReconnect();
  };

  private handleError = (event: Event) => {
    this.emitReadyState();
    for (const handler of this.errorHandlers) {
      handler(event);
    }
  };

  private handleMessage = async (event: MessageEvent) => {
    const message = decodeServerToClientMessage<State>(
      await (event.data as Blob).arrayBuffer(),
    );

    switch (message.type) {
      case "full":
        return this.updateState((target) =>
          Object.assign(target, message.state),
        );
      case "patch":
        return this.updateState((target) => applyPatch(target, message.patch));
    }
  };

  private updateState = (mutation: StateMutation<State>) => {
    for (const handler of this.stateHandlers) {
      handler(mutation);
    }
  };

  private emitReadyState = () => {
    const readyState = this.getReadyState();
    for (const handler of this.readyStateHandlers) {
      handler(readyState);
    }
  };
}

const webSocketToSyncClientReadyState = {
  [WebSocket.CONNECTING]: "connecting",
  [WebSocket.OPEN]: "open",
  [WebSocket.CLOSING]: "closing",
  [WebSocket.CLOSED]: "closed",
} as const;

type WebSocketReadyState = keyof typeof webSocketToSyncClientReadyState;

export type SyncClientReadyState =
  (typeof webSocketToSyncClientReadyState)[keyof typeof webSocketToSyncClientReadyState];

function coerceReadyState(
  state: WebSocketReadyState = WebSocket.CONNECTING,
): SyncClientReadyState {
  return webSocketToSyncClientReadyState[state];
}

export { type ClientId } from "./shared";
