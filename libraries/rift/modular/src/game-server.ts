import type { ClientId, RiftServer } from "@rift/core";
import { resolveModules } from "./resolver";
import type {
  AnyModule,
  GameWebSocket,
  GameWebSocketServer,
  ModuleResult,
  ServerContextValues,
  ServerApi,
  ServerContext,
} from "./types";

interface GameServerConfig {
  modules: AnyModule[];
  rift: RiftServer;
  wss: GameWebSocketServer;
  tickRate: number;
  values: ServerContextValues;
}

interface ServerModuleState {
  module: AnyModule;
  dispose?: () => void;
}

export class GameServer {
  readonly #moduleApis = new Map<AnyModule, object>();
  readonly #moduleState: ServerModuleState[] = [];
  readonly #tickHandlers: Array<(dt: number) => void> = [];
  readonly #clients = new Map<ClientId, GameWebSocket>();
  #intervalId: ReturnType<typeof setInterval> | undefined;
  #lastTickAt = 0;

  constructor(private readonly config: GameServerConfig) {}

  async start(): Promise<void> {
    if (this.#intervalId !== undefined) {
      return;
    }

    const resolved = resolveModules(this.config.modules, "server");
    await resolved.reduce(async (previous, module) => {
      await previous;
      const setup = module.server;
      if (!setup) {
        return;
      }

      const result = await setup(this.#createContext());
      this.#storeModuleState(module, result);
    }, Promise.resolve());

    this.#lastTickAt = performance.now();
    this.#intervalId = setInterval(() => {
      this.#tick();
    }, 1000 / this.config.tickRate);
  }

  dispose(): void {
    if (this.#intervalId !== undefined) {
      clearInterval(this.#intervalId);
      this.#intervalId = undefined;
    }

    for (const { dispose } of this.#moduleState.toReversed()) {
      dispose?.();
    }

    this.#moduleState.length = 0;
    this.#moduleApis.clear();
    this.#tickHandlers.length = 0;
    this.#clients.clear();
  }

  #createContext(): ServerContext {
    return {
      rift: this.config.rift,
      wss: this.config.wss,
      values: this.config.values,
      addClient: (clientId, socket) => {
        this.config.rift.addClient(clientId);
        this.#clients.set(clientId, socket);
      },
      removeClient: (clientId) => {
        this.config.rift.removeClient(clientId);
        this.#clients.delete(clientId);
      },
      using: (module) => {
        const api = this.#moduleApis.get(module);
        if (!api) {
          throw new Error(`Module has not been initialized`, { cause: module });
        }
        return api as ServerApi<typeof module>;
      },
      onTick: (handler) => {
        this.#tickHandlers.push(handler);
      },
    };
  }

  #storeModuleState(module: AnyModule, result: ModuleResult<object>): void {
    this.#moduleApis.set(module, result.api);
    this.#moduleState.push({
      module,
      dispose: result.dispose,
    });
  }

  #tick(): void {
    const now = performance.now();
    const dt = (now - this.#lastTickAt) / 1000;
    this.#lastTickAt = now;

    this.config.rift.tick();
    for (const handler of this.#tickHandlers) {
      handler(dt);
    }

    const packets = this.config.rift.flush();
    for (const [clientId, packet] of packets) {
      if (!packet) {
        continue;
      }
      const socket = this.#clients.get(clientId);
      if (socket && socket.readyState === socket.OPEN) {
        socket.send(packet);
      }
    }
  }
}
