import type { RiftClient } from "@rift/core";
import { resolveModules } from "./resolver";
import { toUint8ArrayMessage } from "./socket-message";
import type {
  AnyModule,
  ClientApi,
  ClientContext,
  GameClientSocket,
  ModuleResult,
} from "./types";

interface GameClientConfig {
  modules: AnyModule[];
  rift: RiftClient;
  socket: GameClientSocket;
  root: HTMLElement;
  window: Window;
}

interface ClientModuleState {
  module: AnyModule;
  dispose?: () => void;
}

export class GameClient {
  readonly #moduleApis = new Map<AnyModule, object>();
  readonly #moduleState: ClientModuleState[] = [];

  constructor(private readonly config: GameClientConfig) {}

  async start(): Promise<void> {
    this.config.socket.onmessage = (event) => {
      this.config.rift.apply(toUint8ArrayMessage(event.data));
    };

    const resolved = resolveModules(this.config.modules, "client");
    await resolved.reduce(async (previous, module) => {
      await previous;
      const setup = module.client;
      if (!setup) {
        return;
      }

      const result = await setup(this.#createContext());
      this.#storeModuleState(module, result);
    }, Promise.resolve());
  }

  send(data: Uint8Array): void {
    if (this.config.socket.readyState === this.config.socket.OPEN) {
      this.config.socket.send(data);
    }
  }

  dispose(): void {
    for (const { dispose } of this.#moduleState.toReversed()) {
      dispose?.();
    }

    this.#moduleState.length = 0;
    this.#moduleApis.clear();
  }

  #createContext(): ClientContext {
    return {
      rift: this.config.rift,
      socket: this.config.socket,
      root: this.config.root,
      window: this.config.window,
      send: (type, value) => this.send(this.config.rift.emit(type, value)),
      using: (module) => {
        const api = this.#moduleApis.get(module);
        if (!api) {
          throw new Error(`Module has not been initialized`, { cause: module });
        }
        return api as ClientApi<typeof module>;
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
}
