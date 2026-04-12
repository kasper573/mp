import { afterEach, expect, test, vi } from "vitest";
import { RiftServer, RiftWorld, tag } from "@rift/core";
import { defineModule } from "../define-module";
import { GameServer } from "../game-server";
import type {
  GameWebSocket,
  GameWebSocketMessage,
  GameWebSocketServer,
} from "../types";

class FakeWebSocket implements GameWebSocket {
  readonly OPEN = 1;
  readyState = 1;
  readonly sent: Uint8Array[] = [];
  readonly #messageHandlers = new Set<(data: GameWebSocketMessage) => void>();
  readonly #closeHandlers = new Set<() => void>();

  send(data: Uint8Array): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    for (const handler of this.#closeHandlers) {
      handler();
    }
  }

  on(
    event: "close" | "message",
    handler: (() => void) | ((data: GameWebSocketMessage) => void),
  ): void {
    if (event === "close") {
      this.#closeHandlers.add(handler as () => void);
      return;
    }
    this.#messageHandlers.add(handler as (data: GameWebSocketMessage) => void);
  }

  once(event: "message", handler: (data: GameWebSocketMessage) => void): void {
    const wrapped = (data: GameWebSocketMessage) => {
      this.#messageHandlers.delete(wrapped);
      handler(data);
    };
    this.#messageHandlers.add(wrapped);
  }
}

class FakeWebSocketServer implements GameWebSocketServer {
  #connectionHandler:
    | ((socket: GameWebSocket, request: unknown) => void)
    | undefined;

  on(
    event: "connection",
    handler: (socket: GameWebSocket, request: unknown) => void,
  ): void {
    if (event === "connection") {
      this.#connectionHandler = handler;
    }
  }

  connect(socket: GameWebSocket, request: unknown = {}): void {
    this.#connectionHandler?.(socket, request);
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("initializes modules in dependency order and wires cross-talk", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("performance", { now: vi.fn(() => 1000) });

  const order: string[] = [];
  const tickOrder: string[] = [];
  const world = new RiftWorld({ components: [], events: [] });
  const rift = new RiftServer(world);
  const wss = new FakeWebSocketServer();

  const base = defineModule({
    server: (ctx) => {
      order.push("base");
      ctx.onTick(() => {
        tickOrder.push("base");
      });
      return { api: { value: 1 } };
    },
  });

  const feature = defineModule({
    dependencies: [base] as const,
    server: (ctx) => {
      order.push(`feature:${ctx.using(base).value}`);
      ctx.onTick(() => {
        tickOrder.push("feature");
      });
      return { api: {} };
    },
  });

  const server = new GameServer({
    modules: [feature, base],
    rift,
    wss,
    tickRate: 20,
    values: {},
  });

  await server.start();
  vi.advanceTimersByTime(50);

  expect(order).toEqual(["base", "feature:1"]);
  expect(tickOrder).toEqual(["base", "feature"]);

  server.dispose();
});

test("delivers flush packets to registered clients", async () => {
  vi.useFakeTimers();
  let now = 1000;
  vi.stubGlobal("performance", { now: vi.fn(() => now) });

  const event = tag();
  const world = new RiftWorld({ components: [], events: [event] });
  const rift = new RiftServer(world);
  const wss = new FakeWebSocketServer();
  const socket = new FakeWebSocket();

  const players = defineModule({
    server: (ctx) => {
      ctx.addClient("1", socket);
      ctx.onTick(() => {
        rift.emit(event, undefined).to("1");
      });
      return { api: {} };
    },
  });

  const server = new GameServer({
    modules: [players],
    rift,
    wss,
    tickRate: 20,
    values: {},
  });

  await server.start();
  now += 50;
  vi.advanceTimersByTime(50);

  expect(socket.sent).toHaveLength(1);

  server.dispose();
});

test("exposes app-owned values through server context", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("performance", { now: vi.fn(() => 1000) });

  const seen: number[] = [];
  const world = new RiftWorld({ components: [], events: [] });
  const rift = new RiftServer(world);
  const wss = new FakeWebSocketServer();

  const module = defineModule({
    server: (ctx) => {
      const value = ctx.values as { tickRateOverride: number };
      seen.push(value.tickRateOverride);
      return { api: {} };
    },
  });

  const server = new GameServer({
    modules: [module],
    rift,
    wss,
    tickRate: 20,
    values: { tickRateOverride: 42 },
  });

  await server.start();

  expect(seen).toEqual([42]);

  server.dispose();
});
