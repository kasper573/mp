import type {
  ClientId,
  Infer,
  RiftClient,
  RiftServer,
  RiftType,
} from "@rift/core";

export type MaybePromise<T> = T | Promise<T>;

export interface ModuleResult<TApi extends object> {
  api: TApi;
  dispose?: () => void;
}

export type GameWebSocketMessage = string | ArrayBuffer | ArrayBufferView;

export interface GameWebSocket {
  readonly OPEN: number;
  readonly readyState: number;
  send(data: Uint8Array): void;
  close(): void;
  on(event: "close", handler: () => void): void;
  on(event: "message", handler: (data: GameWebSocketMessage) => void): void;
  once?(event: "message", handler: (data: GameWebSocketMessage) => void): void;
}

export interface GameWebSocketServer {
  on(event: "connection", handler: (socket: GameWebSocket) => void): void;
}

export interface GameClientSocket {
  readonly OPEN: number;
  readonly readyState: number;
  onmessage:
    | ((event: MessageEvent<string | ArrayBuffer | ArrayBufferView>) => void)
    | null;
  onopen?: ((event: Event) => void) | null;
  onclose?: ((event: CloseEvent) => void) | null;
  send(data: string | ArrayBuffer | ArrayBufferView | Blob): void;
}

export interface ServerContextValues {}

export interface ModuleConfig<
  TDeps extends readonly AnyModule[],
  TClientApi extends object,
  TServerApi extends object,
> {
  dependencies?: TDeps;
  client?: (ctx: ClientContext) => MaybePromise<ModuleResult<TClientApi>>;
  server?: (ctx: ServerContext) => MaybePromise<ModuleResult<TServerApi>>;
}

export interface Module<
  TDeps extends readonly AnyModule[] = readonly AnyModule[],
  TClientApi extends object = Record<string, never>,
  TServerApi extends object = Record<string, never>,
> {
  readonly dependencies: TDeps;
  readonly client?: (
    ctx: ClientContext,
  ) => MaybePromise<ModuleResult<TClientApi>>;
  readonly server?: (
    ctx: ServerContext,
  ) => MaybePromise<ModuleResult<TServerApi>>;
}

export type AnyModule = Module<readonly AnyModule[], object, object>;

type InferModuleResult<T> =
  Awaited<T> extends ModuleResult<infer TApi> ? TApi : Record<string, never>;

export type ClientApi<M extends AnyModule> = M extends {
  client?: ((ctx: ClientContext) => infer TResult) | undefined;
}
  ? InferModuleResult<TResult>
  : Record<string, never>;

export type ServerApi<M extends AnyModule> = M extends {
  server?: ((ctx: ServerContext) => infer TResult) | undefined;
}
  ? InferModuleResult<TResult>
  : Record<string, never>;

export interface ServerContext {
  rift: RiftServer;
  wss: GameWebSocketServer;
  values: ServerContextValues;
  addClient(clientId: ClientId, socket: GameWebSocket): void;
  removeClient(clientId: ClientId): void;
  using<M extends AnyModule>(module: M): ServerApi<M>;
  onTick(handler: (dt: number) => void): void;
}

export interface ClientContext {
  rift: RiftClient;
  socket: GameClientSocket;
  /**
   * Convenience shorthand for emitting a message with rift and then sending it through the socket.
   */
  send<T extends RiftType>(type: T, value: Infer<T>): void;
  root: HTMLElement;
  window: Window;
  using<M extends AnyModule>(module: M): ClientApi<M>;
}
