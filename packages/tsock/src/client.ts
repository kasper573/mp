import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import {
  type SocketIO_ClientToServerEvents,
  type SocketIO_ServerToClientEvents,
  transports,
} from "./shared";

export interface CreateClientOptions<Context> {
  url: string;
  context: () => Context;
}

export function createClient<Router, Context>(
  options: CreateClientOptions<Context>,
): Client<Router, Context> {
  const socket = io(options.url, { transports });

  // Append context to all emitted events so it doesn't have to be passed manually
  const emit = socket.emit;
  socket.emit = (...args) => emit.call(socket, ...args, options.context());

  return socket;
}

export type Client<Router, Context> = Pick<
  Socket<
    SocketIO_ClientToServerEvents<Router, Context>,
    SocketIO_ServerToClientEvents<Router>
  >,
  "emit" | "on" | "off"
>;
