import { createHash } from "node:crypto";
import { effect } from "@preact/signals-core";
import { beforeEach, describe, expect, it } from "vitest";
import { f32, object, string, u32 } from "@rift/types";
import { inject } from "@rift/module";
import {
  ClientConnected,
  ClientDisconnected,
  type ClientId,
  defineSchema,
  DeltaApplied,
  RiftClient,
  RiftClientModule,
  RiftCloseCode,
  RiftServer,
  type RiftServerEvent,
  RiftServerModule,
  Tick,
} from "../src/index";
import type {
  ClientTransport,
  ClientTransportEvent,
  ServerTransport,
  ServerTransportEvent,
} from "../src/transport";

function sha256(input: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(input).digest());
}

const pos = object({ x: f32(), y: f32() });
const name = string();
const health = u32();
const ping = object({ note: string() });
const pong = object({ value: u32() });

function makeSchema() {
  return defineSchema({
    components: [pos, name, health],
    events: [ping, pong],
    hash: sha256,
  });
}

function altSchema() {
  return defineSchema({
    components: [string()],
    events: [],
    hash: sha256,
  });
}

interface PairedTransports {
  server: ServerTransport;
  client: ClientTransport;
  fromClient: ClientId;
  triggerClientError(err: Error): void;
}

function makePair(clientId: number): PairedTransports {
  const id = clientId as ClientId;
  let serverListener: ((ev: ServerTransportEvent) => void) | undefined;
  let clientListener: ((ev: ClientTransportEvent) => void) | undefined;
  let clientState: "connecting" | "open" | "closing" | "closed" = "open";

  function emitToServer(ev: ServerTransportEvent): void {
    serverListener?.(ev);
  }
  function emitToClient(ev: ClientTransportEvent): void {
    clientListener?.(ev);
  }

  const server: ServerTransport = {
    on(listener) {
      serverListener = listener;
      queueMicrotask(() => emitToServer({ type: "open", clientId: id }));
      return () => {
        serverListener = undefined;
      };
    },
    send(_id, data) {
      emitToClient({ type: "message", data });
    },
    close(_id, code, reason = "") {
      clientState = "closed";
      emitToClient({ type: "close", code, reason });
      emitToServer({ type: "close", clientId: id, code, reason });
    },
    shutdown(code = RiftCloseCode.Normal, reason = "shutdown") {
      clientState = "closed";
      emitToClient({ type: "close", code, reason });
      emitToServer({ type: "close", clientId: id, code, reason });
      return Promise.resolve();
    },
  };

  const client: ClientTransport = {
    get state() {
      return clientState;
    },
    on(listener) {
      clientListener = listener;
      return () => {
        clientListener = undefined;
      };
    },
    send(data) {
      emitToServer({ type: "message", clientId: id, data });
    },
    close(code = RiftCloseCode.Normal, reason = "") {
      clientState = "closed";
      emitToClient({ type: "close", code, reason });
      emitToServer({ type: "close", clientId: id, code, reason });
    },
  };

  return {
    server,
    client,
    fromClient: id,
    triggerClientError(err) {
      emitToClient({ type: "error", error: err });
    },
  };
}

function flush(times = 4): Promise<void> {
  return Array.from({ length: times }).reduce<Promise<void>>(
    (p) => p.then(() => undefined),
    Promise.resolve(),
  );
}

describe("RiftServer + RiftClient handshake", () => {
  it("client receives snapshot with pre-existing entities", async () => {
    const schema = makeSchema();
    const pair = makePair(1);
    const server = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
    });
    const e = server.world.create();
    server.world.add(e, pos, { x: 4, y: 5 });
    server.world.add(e, name, "alpha");
    await server.start();

    const client = new RiftClient({ schema, transport: pair.client });
    await client.connect();

    expect(client.state.value).toBe("open");
    expect(client.clientId).toBe(pair.fromClient);
    const mirrored = client.world.get(e, pos);
    expect(mirrored?.x).toBe(4);
    expect(mirrored?.y).toBe(5);
    expect(client.world.get(e, name)).toBe("alpha");

    await server.stop();
    await flush();
  });

  it("rejects connection on schema mismatch", async () => {
    const pair = makePair(2);
    const server = new RiftServer({
      schema: makeSchema(),
      transport: pair.server,
      tickRateHz: 0,
    });
    await server.start();

    const client = new RiftClient({
      schema: altSchema(),
      transport: pair.client,
    });
    await expect(client.connect()).rejects.toThrow(/schema mismatch/);

    await server.stop();
  });
});

describe("delta replication", () => {
  it("propagates create/update/remove via tick", async () => {
    const schema = makeSchema();
    const pair = makePair(3);
    const server = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
    });
    await server.start();
    const client = new RiftClient({ schema, transport: pair.client });
    await client.connect();

    const e = server.world.create();
    server.world.add(e, pos, { x: 1, y: 2 });
    server.tick(0);
    await flush();
    expect(client.world.get(e, pos)?.x).toBe(1);

    const p = server.world.get(e, pos);
    if (p) {
      p.x = 99;
    }
    server.tick(0);
    await flush();
    expect(client.world.get(e, pos)?.x).toBe(99);

    server.world.remove(e, pos);
    server.tick(0);
    await flush();
    expect(client.world.has(e, pos)).toBe(false);

    server.world.destroy(e);
    server.tick(0);
    await flush();
    expect(client.world.exists(e)).toBe(false);

    await server.stop();
  });

  it("visibility predicate filters entities for a client", async () => {
    const schema = makeSchema();
    const pair = makePair(4);
    const server = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
    });
    await server.start();
    const client = new RiftClient({ schema, transport: pair.client });
    await client.connect();

    const visible = server.world.create();
    server.world.add(visible, name, "yes");
    const hidden = server.world.create();
    server.world.add(hidden, name, "no");
    server.setClientVisibilityPredicate(pair.fromClient, (id) => id !== hidden);
    server.tick(0);
    await flush();

    expect(client.world.exists(visible)).toBe(true);
    expect(client.world.exists(hidden)).toBe(false);

    server.setClientVisibilityPredicate(pair.fromClient, undefined);
    server.tick(0);
    await flush();
    expect(client.world.exists(hidden)).toBe(true);
  });

  it("predicate flip emits destroy then create on next flip", async () => {
    const schema = makeSchema();
    const pair = makePair(16);
    const server = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
    });
    await server.start();
    const client = new RiftClient({ schema, transport: pair.client });
    await client.connect();

    const e = server.world.create();
    server.world.add(e, name, "e");
    server.tick(0);
    await flush();
    expect(client.world.exists(e)).toBe(true);

    server.setClientVisibilityPredicate(pair.fromClient, () => false);
    server.tick(0);
    await flush();
    expect(client.world.exists(e)).toBe(false);

    server.setClientVisibilityPredicate(pair.fromClient, () => true);
    server.tick(0);
    await flush();
    expect(client.world.exists(e)).toBe(true);
    expect(client.world.get(e, name)).toBe("e");

    await server.stop();
  });
});

describe("event routing", () => {
  it("wire events from a client arrive with wire source carrying the clientId", async () => {
    const schema = makeSchema();
    const pair = makePair(5);
    const server = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
    });
    const received: RiftServerEvent<{ note: string }>[] = [];
    server.on(ping, (event) => {
      received.push(event);
    });
    await server.start();

    const client = new RiftClient({ schema, transport: pair.client });
    await client.connect();

    client.emit({
      type: ping,
      data: { note: "hi" },
      source: "local",
      target: "wire",
    });
    await flush();

    expect(received).toHaveLength(1);
    expect(received[0].data).toEqual({ note: "hi" });
    expect(received[0].source).toEqual({
      type: "wire",
      clientId: pair.fromClient,
    });
    await server.stop();
  });

  it("broadcast and client-list strategies deliver server emits to clients", async () => {
    const schema = makeSchema();
    const pair = makePair(6);
    const server = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
    });
    await server.start();
    const client = new RiftClient({ schema, transport: pair.client });

    const got: number[] = [];
    client.on(pong, (event) => {
      got.push(event.data.value);
    });
    await client.connect();

    server.emit({
      type: pong,
      data: { value: 7 },
      source: { type: "local" },
      target: { type: "wire", strategy: { type: "broadcast" } },
    });
    server.emit({
      type: pong,
      data: { value: 11 },
      source: { type: "local" },
      target: {
        type: "wire",
        strategy: { type: "list", ids: [pair.fromClient] },
      },
    });
    server.tick(0);
    await flush();

    expect(got.sort((a, b) => a - b)).toEqual([7, 11]);
    await server.stop();
  });

  it("entity strategy only delivers to clients whose predicate sees that entity", async () => {
    const schema = makeSchema();
    const pair = makePair(7);
    const server = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
    });
    await server.start();
    const client = new RiftClient({ schema, transport: pair.client });
    const seen: number[] = [];
    client.on(pong, (event) => {
      seen.push(event.data.value);
    });
    await client.connect();

    const target = server.world.create();
    server.world.add(target, name, "target");
    server.setClientVisibilityPredicate(pair.fromClient, () => false);

    server.emit({
      type: pong,
      data: { value: 1 },
      source: { type: "local" },
      target: { type: "wire", strategy: { type: "entity", entityId: target } },
    });
    server.tick(0);
    await flush();
    expect(seen).toEqual([]);

    server.setClientVisibilityPredicate(pair.fromClient, () => true);
    server.emit({
      type: pong,
      data: { value: 2 },
      source: { type: "local" },
      target: { type: "wire", strategy: { type: "entity", entityId: target } },
    });
    server.tick(0);
    await flush();
    expect(seen).toEqual([2]);

    await server.stop();
  });

  it("disconnect drops the visibility predicate so reconnects start clean", async () => {
    const schema = makeSchema();
    const pair = makePair(17);
    const server = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
    });
    await server.start();
    const client = new RiftClient({ schema, transport: pair.client });
    await client.connect();
    server.setClientVisibilityPredicate(pair.fromClient, () => false);
    expect(server.getClientIds()).toContain(pair.fromClient);

    await client.disconnect();
    await flush();
    expect(server.getClientIds()).not.toContain(pair.fromClient);

    await server.stop();
  });
});

describe("lifecycle", () => {
  it("fires ClientConnected and ClientDisconnected on the server", async () => {
    const schema = makeSchema();
    const pair = makePair(8);
    const server = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
    });
    const events: string[] = [];
    server.on(ClientConnected, () => {
      events.push("connect");
    });
    server.on(ClientDisconnected, () => {
      events.push("disconnect");
    });
    await server.start();
    const client = new RiftClient({ schema, transport: pair.client });
    await client.connect();
    expect(events).toEqual(["connect"]);

    await client.disconnect();
    await flush();
    expect(events).toEqual(["connect", "disconnect"]);

    await server.stop();
  });

  it("fires Tick handlers each tick", async () => {
    const schema = makeSchema();
    const pair = makePair(9);
    const server = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
    });
    const ticks: number[] = [];
    server.on(Tick, (event) => {
      ticks.push(event.data.tick);
    });
    await server.start();
    server.tick(0);
    server.tick(0);
    expect(ticks).toEqual([1, 2]);
    await server.stop();
  });
});

describe("modules", () => {
  it("server module receives DI and observes events via this.server.on", async () => {
    const schema = makeSchema();
    const pair = makePair(10);
    let server!: RiftServer;
    const observed: number[] = [];

    class HelloModule extends RiftServerModule {
      init() {
        server = this.server;
        return this.server.on(ping, (event) => {
          observed.push(event.data.note.length);
        });
      }
    }

    const srv = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
      modules: [new HelloModule()],
    });
    await srv.start();
    const client = new RiftClient({ schema, transport: pair.client });
    await client.connect();
    expect(server).toBe(srv);

    client.emit({
      type: ping,
      data: { note: "abcd" },
      source: "local",
      target: "wire",
    });
    await flush();
    expect(observed).toEqual([4]);

    await srv.stop();
  });

  it("locally-targeted server emits reach module-registered handlers", async () => {
    const schema = makeSchema();
    const pair = makePair(11);
    const seen: string[] = [];

    class Router extends RiftServerModule {
      init() {
        return this.server.on(ping, (event) => {
          seen.push(event.data.note);
        });
      }
    }

    const router = new Router();
    const server = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
      modules: [router],
    });
    await server.start();

    server.emit({
      type: ping,
      data: { note: "self" },
      source: { type: "local" },
      target: { type: "local" },
    });
    expect(seen).toEqual(["self"]);

    await server.stop();
  });

  it("client modules receive DI", async () => {
    const schema = makeSchema();
    const pair = makePair(12);
    let captured!: RiftClient;

    class ClientHello extends RiftClientModule {
      init() {
        captured = this.client;
      }
    }

    const server = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
    });
    await server.start();
    const client = new RiftClient({
      schema,
      transport: pair.client,
      modules: [new ClientHello()],
    });
    await client.connect();
    expect(captured).toBe(client);

    await server.stop();
  });

  it("module dependency chain initializes in topological order", async () => {
    const schema = makeSchema();
    const pair = makePair(13);
    const order: string[] = [];

    class Base extends RiftServerModule {
      init() {
        order.push("base");
      }
    }
    class Dep extends RiftServerModule {
      @inject(Base) accessor base!: Base;
      init() {
        order.push("dep");
        expect(this.base).toBeInstanceOf(Base);
      }
    }

    const server = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
      modules: [new Dep(), new Base()],
    });
    await server.start();
    expect(order).toEqual(["base", "dep"]);
    await server.stop();
  });
});

describe("RiftClient.state signal", () => {
  it("exposes a readonly signal that subscribers can observe", async () => {
    const schema = makeSchema();
    const pair = makePair(14);
    const server = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
    });
    await server.start();
    const client = new RiftClient({ schema, transport: pair.client });

    const observed: string[] = [];
    const dispose = effect(() => {
      observed.push(client.state.value);
    });

    await client.connect();
    await client.disconnect();
    dispose();

    expect(observed[0]).toBe("idle");
    expect(observed.includes("connecting")).toBe(true);
    expect(observed.includes("handshaking")).toBe(true);
    expect(observed.includes("open")).toBe(true);
    expect(observed[observed.length - 1]).toBe("closed");

    await server.stop();
  });
});

describe("emit guard", () => {
  let schema: ReturnType<typeof makeSchema>;
  beforeEach(() => {
    schema = makeSchema();
  });

  it("client.emit drops wire-targeted events while not open", async () => {
    const pair = makePair(15);
    const server = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
    });
    const received: string[] = [];
    server.on(ping, (event) => {
      received.push(event.data.note);
    });
    await server.start();
    const client = new RiftClient({ schema, transport: pair.client });

    client.emit({
      type: ping,
      data: { note: "early" },
      source: "local",
      target: "wire",
    });
    await flush();
    expect(received).toEqual([]);

    await client.connect();
    client.emit({
      type: ping,
      data: { note: "later" },
      source: "local",
      target: "wire",
    });
    await flush();
    expect(received).toEqual(["later"]);

    await server.stop();
  });
});

describe("server time replication", () => {
  it("stamps tick and timeMs on accept and deltas", async () => {
    const schema = makeSchema();
    const pair = makePair(50);
    const server = new RiftServer({
      schema,
      transport: pair.server,
      tickRateHz: 0,
    });
    await server.start();
    server.tick(0.1);
    server.tick(0.2);

    const client = new RiftClient({ schema, transport: pair.client });
    const applied: Array<{ tick: number; timeMs: number }> = [];
    client.on(DeltaApplied, (e) => {
      applied.push({ tick: e.data.tick, timeMs: e.data.timeMs });
    });
    await client.connect();

    expect(client.serverTick.value).toBe(2);
    expect(client.serverTime.value).toBe(300);
    expect(applied[0]).toEqual({ tick: 2, timeMs: 300 });

    const e = server.world.create();
    server.world.add(e, pos, { x: 1, y: 2 });
    server.tick(0.05);
    await flush();

    expect(client.serverTick.value).toBe(3);
    expect(client.serverTime.value).toBe(350);
    expect(applied.at(-1)).toEqual({ tick: 3, timeMs: 350 });

    await server.stop();
  });
});
