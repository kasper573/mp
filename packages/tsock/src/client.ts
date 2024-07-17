import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { separator, type Flattened } from "./flattened";
import type {
  OperationDefinition,
  OperationResolution,
  RouterDefinition,
  Unsubscribe,
} from "./shared";
import type {
  ClientToServerEvents,
  RouterPath,
  ServerToClientEvents,
} from "./socket";

export interface CreateClientOptions<ClientContext> {
  url: string;
  context: () => ClientContext;
  log?: typeof console.log;
}

export class Client<
  ClientContext,
  Router extends RouterDefinition<ClientContext>,
> {
  private socket: Socket<
    ServerToClientEvents,
    ClientToServerEvents<ClientContext>
  >;

  constructor(private options: CreateClientOptions<ClientContext>) {
    this.socket = io(this.options.url, {
      transports: ["websocket"],
    });
    this.socket.on("connect", () => this.log("connected"));
    this.socket.on("disconnect", () => this.log("disconnected"));
  }

  send<Name extends OperationName<Router>>(
    name: Name,
    input: OperationInput<Name, Router>,
  ): OperationResolution {
    this.log("send", name, input);
    const path: RouterPath = String(name).split(separator);
    this.socket.emit("operation", this.options.context(), path, input);
  }

  subscribe<Name extends OperationName<Router>>(
    name: Name,
    receiver: (input: OperationInput<Name, Router>) => void,
  ): Unsubscribe {
    this.log("subscribe", name);
    return () => {
      this.log("unsubscribe", name);
    };
  }

  close() {
    this.socket.close();
  }

  private log(...args: unknown[]) {
    this.options.log?.("[tsock client]", ...args);
  }
}

type OperationInput<Name extends OperationName<Router>, Router> =
  Flattened<Router>[Name] extends OperationDefinition<infer _, infer Input>
    ? Input
    : never;

type OperationName<Router> = keyof Flattened<Router>;
