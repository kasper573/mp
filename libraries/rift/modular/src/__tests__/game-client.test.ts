import { expect, test } from "vitest";
import { RiftClient, RiftServer, RiftWorld, tag } from "@rift/core";
import { defineModule } from "../define-module";
import { GameClient } from "../game-client";
import type { GameClientSocket } from "../types";

class FakeClientSocket implements GameClientSocket {
  readonly OPEN = 1;
  readyState = 1;
  #onmessage:
    | ((event: { data: string | ArrayBuffer | ArrayBufferView }) => void)
    | null = null;
  readonly sent: Uint8Array[] = [];

  get onmessage():
    | ((event: { data: string | ArrayBuffer | ArrayBufferView }) => void)
    | null {
    return this.#onmessage;
  }

  set onmessage(
    handler:
      | ((event: { data: string | ArrayBuffer | ArrayBufferView }) => void)
      | null,
  ) {
    this.#onmessage = handler;
  }

  send(data: Uint8Array): void {
    this.sent.push(data);
  }
}

class BufferedClientSocket extends FakeClientSocket {
  #pendingMessage: Uint8Array | undefined;

  constructor(message: Uint8Array) {
    super();
    this.#pendingMessage = message;
  }

  override set onmessage(
    handler:
      | ((event: { data: string | ArrayBuffer | ArrayBufferView }) => void)
      | null,
  ) {
    super.onmessage = handler;
    if (handler && this.#pendingMessage) {
      handler({ data: this.#pendingMessage });
      this.#pendingMessage = undefined;
    }
  }
}

function createRoot(): HTMLElement {
  return {
    appendChild() {
      return null;
    },
  } as unknown as HTMLElement;
}

function createWindow(): Window {
  return {} as unknown as Window;
}

test("initializes client modules in dependency order and wires cross-talk", async () => {
  const order: string[] = [];
  const world = new RiftWorld({
    components: [tag()],
    events: [],
  });
  const rift = new RiftClient(world);
  const socket = new FakeClientSocket();
  const root = createRoot();

  const base = defineModule({
    client: () => {
      order.push("base");
      return { api: { value: "ok" } };
    },
  });

  const feature = defineModule({
    dependencies: [base] as const,
    client: (ctx) => {
      order.push(`feature:${ctx.using(base).value}`);
      return { api: {} };
    },
  });

  const client = new GameClient({
    modules: [feature, base],
    rift,
    socket,
    root,
    window: createWindow(),
  });

  await client.start();

  expect(order).toEqual(["base", "feature:ok"]);
});

test("applies websocket messages before module setup", async () => {
  const Spawned = tag();
  const world = new RiftWorld({
    components: [Spawned],
    events: [],
  });
  const server = new RiftServer(world);
  server.addClient("1");
  const entity = server.spawn();
  entity.set(Spawned);
  const packet = server.flush().get("1");

  const rift = new RiftClient(world);
  const socket = new BufferedClientSocket(packet!);
  const root = createRoot();
  const seen: number[] = [];

  const module = defineModule({
    client: (ctx) => {
      seen.push(ctx.rift.query(Spawned).value.length);
      return { api: {} };
    },
  });

  const client = new GameClient({
    modules: [module],
    rift,
    socket,
    root,
    window: createWindow(),
  });

  await client.start();

  expect(seen).toEqual([1]);
});
