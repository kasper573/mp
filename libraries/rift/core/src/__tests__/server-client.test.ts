import { describe, it, expect } from "vitest";
import { effect } from "@preact/signals-core";
import {
  RiftWorld,
  RiftServer,
  RiftClient,
  struct,
  f32,
  u32,
  string,
  tag,
  array,
  optional,
  type Infer,
} from "../index";

const Position = struct({ x: f32(), y: f32() });
const Health = struct({ current: u32(), max: u32() });
const IsEnemy = tag();

/** Simulate a server → client sync cycle */
function syncToClient(
  server: RiftServer,
  client: RiftClient,
  clientId: string,
) {
  server.tick();
  const packets = server.flush();
  const buf = packets.get(clientId);
  if (buf) {
    client.apply(buf);
  }
}

describe("RiftServer", () => {
  it("spawns entities", () => {
    const world = new RiftWorld({ components: [Position], events: [] });
    const server = new RiftServer(world);
    const e = server.spawn();
    expect(e.id).toBeDefined();
    e.set(Position, { x: 10, y: 20 });
    expect(e.get(Position).x).toBeCloseTo(10);
  });

  it("destroys entities", () => {
    const world = new RiftWorld({ components: [Position], events: [] });
    const server = new RiftServer(world);
    const e = server.spawn();
    const id = e.id;
    server.destroy(e);
    expect(server.entity(id)).toBeUndefined();
  });

  it("query returns matching entities", () => {
    const world = new RiftWorld({
      components: [Position, Health],
      events: [],
    });
    const server = new RiftServer(world);

    const e1 = server.spawn();
    e1.set(Position, { x: 0, y: 0 });
    e1.set(Health, { current: 100, max: 100 });

    const e2 = server.spawn();
    e2.set(Position, { x: 10, y: 10 });

    const q = server.query(Position, Health);
    expect(q.value).toHaveLength(1);
    expect(q.value[0].id).toBe(e1.id);
  });

  it("query updates when components change", () => {
    const world = new RiftWorld({
      components: [Position, Health],
      events: [],
    });
    const server = new RiftServer(world);
    const q = server.query(Position, Health);

    const e = server.spawn();
    e.set(Position, { x: 0, y: 0 });
    expect(q.value).toHaveLength(0);

    e.set(Health, { current: 100, max: 100 });
    expect(q.value).toHaveLength(1);

    e.remove(Health);
    expect(q.value).toHaveLength(0);
  });
});

describe("server → client sync", () => {
  it("syncs spawned entities with initial state", () => {
    const world = new RiftWorld({ components: [Position, Health], events: [] });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const hero = server.spawn();
    hero.set(Position, { x: 10, y: 20 });
    hero.set(Health, { current: 100, max: 100 });

    syncToClient(server, client, "c1");

    const ce = client.entity(hero.id);
    expect(ce).toBeDefined();
    expect(ce!.get(Position).x).toBeCloseTo(10);
    expect(ce!.get(Position).y).toBeCloseTo(20);
    expect(ce!.get(Health).current).toBe(100);
  });

  it("syncs component mutations as deltas", () => {
    const world = new RiftWorld({ components: [Position], events: [] });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const e = server.spawn();
    e.set(Position, { x: 0, y: 0 });
    syncToClient(server, client, "c1");

    // Mutate single field
    e.get(Position).x = 42;
    syncToClient(server, client, "c1");

    const ce = client.entity(e.id)!;
    expect(ce.get(Position).x).toBeCloseTo(42);
    expect(ce.get(Position).y).toBeCloseTo(0); // unchanged
  });

  it("syncs entity destruction", () => {
    const world = new RiftWorld({ components: [Position], events: [] });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const e = server.spawn();
    e.set(Position, { x: 0, y: 0 });
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)).toBeDefined();

    server.destroy(e);
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)).toBeUndefined();
  });

  it("syncs component removal", () => {
    const world = new RiftWorld({ components: [Position, Health], events: [] });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const e = server.spawn();
    e.set(Position, { x: 0, y: 0 });
    e.set(Health, { current: 100, max: 100 });
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)!.has(Health)).toBe(true);

    e.remove(Health);
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)!.has(Health)).toBe(false);
  });

  it("syncs component added to existing entity", () => {
    const world = new RiftWorld({ components: [Position, Health], events: [] });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const e = server.spawn();
    e.set(Position, { x: 5, y: 5 });
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)!.has(Health)).toBe(false);

    e.set(Health, { current: 50, max: 100 });
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)!.has(Health)).toBe(true);
    expect(client.entity(e.id)!.get(Health).current).toBe(50);
  });

  it("flush returns undefined for clients with no changes", () => {
    const world = new RiftWorld({ components: [Position], events: [] });
    const server = new RiftServer(world);
    server.addClient("c1");

    const e = server.spawn();
    e.set(Position, { x: 0, y: 0 });
    server.tick();
    server.flush(); // initial sync

    // No changes
    server.tick();
    const packets = server.flush();
    expect(packets.get("c1")).toBeUndefined();
  });

  it("syncs tag components", () => {
    const world = new RiftWorld({
      components: [Position, IsEnemy],
      events: [],
    });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const e = server.spawn();
    e.set(Position, { x: 0, y: 0 });
    e.set(IsEnemy);
    syncToClient(server, client, "c1");

    expect(client.entity(e.id)!.has(IsEnemy)).toBe(true);
  });

  it("syncs scalar components", () => {
    const Score = u32();
    const world = new RiftWorld({ components: [Score], events: [] });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const e = server.spawn();
    e.set(Score, 42);
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)!.get(Score)).toBe(42);

    e.set(Score, 99);
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)!.get(Score)).toBe(99);
  });

  it("syncs array components", () => {
    const Inventory = array(u32());
    const world = new RiftWorld({ components: [Inventory], events: [] });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const e = server.spawn();
    e.set(Inventory, [1, 2, 3]);
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)!.get(Inventory)).toEqual([1, 2, 3]);
  });

  it("syncs optional components", () => {
    const Nickname = optional(string());
    const world = new RiftWorld({ components: [Nickname], events: [] });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const e = server.spawn();
    e.set(Nickname, "hero");
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)!.get(Nickname)).toBe("hero");

    e.set(Nickname, undefined);
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)!.get(Nickname)).toBeUndefined();
  });
});

describe("events", () => {
  it("server emits event to all clients", () => {
    const ChatMessage = struct({ sender: string(), text: string() });
    const world = new RiftWorld({
      components: [],
      events: [ChatMessage],
    });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const received: Array<Infer<typeof ChatMessage>> = [];
    client.on(ChatMessage, (data) => received.push(data));

    server.emit(ChatMessage, { sender: "alice", text: "hello" }).toAll();
    syncToClient(server, client, "c1");

    expect(received).toHaveLength(1);
    expect(received[0].sender).toBe("alice");
    expect(received[0].text).toBe("hello");
  });

  it("server emits event to specific clients", () => {
    const Msg = struct({ text: string() });
    const world = new RiftWorld({ components: [], events: [Msg] });
    const server = new RiftServer(world);
    const c1 = new RiftClient(world);
    const c2 = new RiftClient(world);
    server.addClient("c1");
    server.addClient("c2");

    const r1: string[] = [];
    const r2: string[] = [];
    c1.on(Msg, (d) => r1.push(d.text));
    c2.on(Msg, (d) => r2.push(d.text));

    server.emit(Msg, { text: "secret" }).to("c1");
    server.tick();
    const packets = server.flush();
    if (packets.get("c1")) {
      c1.apply(packets.get("c1")!);
    }
    if (packets.get("c2")) {
      c2.apply(packets.get("c2")!);
    }

    expect(r1).toEqual(["secret"]);
    expect(r2).toEqual([]); // c2 should not receive it
  });

  it("client emits event to server", () => {
    const MoveTo = struct({ x: f32(), y: f32() });
    const world = new RiftWorld({ components: [], events: [MoveTo] });
    const server = new RiftServer(world);
    const client = new RiftClient(world);

    const received: Array<{ clientId: string; data: Infer<typeof MoveTo> }> =
      [];
    server.on(MoveTo, (clientId, data) => {
      received.push({ clientId, data });
    });

    const buf = client.emit(MoveTo, { x: 100, y: 200 });
    server.handleClientEvent("c1", buf);

    expect(received).toHaveLength(1);
    expect(received[0].clientId).toBe("c1");
    expect(received[0].data.x).toBeCloseTo(100);
    expect(received[0].data.y).toBeCloseTo(200);
  });

  it("server emits to observers of an entity", () => {
    const DamageNumber = struct({ amount: u32() });
    const world = new RiftWorld({
      components: [Position],
      events: [DamageNumber],
    });
    const server = new RiftServer(world);
    const c1 = new RiftClient(world);
    const c2 = new RiftClient(world);
    server.addClient("c1");
    server.addClient("c2");

    const target = server.spawn();
    target.set(Position, { x: 0, y: 0 });

    // c1 can see target, c2 cannot
    server.setScope({
      visibleComponents: (clientId, entity) =>
        clientId === "c1" ? [...entity.components.keys()] : [],
    });

    const r1: number[] = [];
    const r2: number[] = [];
    c1.on(DamageNumber, (d) => r1.push(d.amount));
    c2.on(DamageNumber, (d) => r2.push(d.amount));

    server.emit(DamageNumber, { amount: 42 }).toObserversOf(target);
    server.tick();
    const packets = server.flush();
    if (packets.get("c1")) {
      c1.apply(packets.get("c1")!);
    }
    if (packets.get("c2")) {
      c2.apply(packets.get("c2")!);
    }

    expect(r1).toEqual([42]);
    expect(r2).toEqual([]);
  });
});

describe("scope", () => {
  it("hides entities from clients", () => {
    const world = new RiftWorld({ components: [Position], events: [] });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const visible = server.spawn();
    visible.set(Position, { x: 0, y: 0 });
    const hidden = server.spawn();
    hidden.set(Position, { x: 100, y: 100 });

    server.setScope({
      visibleComponents: (_clientId, entity) =>
        entity.id === visible.id ? [...entity.components.keys()] : [],
    });

    syncToClient(server, client, "c1");
    expect(client.entity(visible.id)).toBeDefined();
    expect(client.entity(hidden.id)).toBeUndefined();
  });

  it("sends destroy when entity leaves scope", () => {
    const world = new RiftWorld({ components: [Position], events: [] });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const e = server.spawn();
    e.set(Position, { x: 0, y: 0 });

    let inScope = true;
    server.setScope({
      visibleComponents: (_, entity) =>
        inScope ? [...entity.components.keys()] : [],
    });

    syncToClient(server, client, "c1");
    expect(client.entity(e.id)).toBeDefined();

    inScope = false;
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)).toBeUndefined();
  });

  it("sends full state when entity enters scope", () => {
    const world = new RiftWorld({ components: [Position], events: [] });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const e = server.spawn();
    e.set(Position, { x: 50, y: 60 });

    let inScope = false;
    server.setScope({
      visibleComponents: (_, entity) =>
        inScope ? [...entity.components.keys()] : [],
    });

    syncToClient(server, client, "c1");
    expect(client.entity(e.id)).toBeUndefined();

    inScope = true;
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)).toBeDefined();
    expect(client.entity(e.id)!.get(Position).x).toBeCloseTo(50);
  });

  it("filters components per entity via scope returning type array", () => {
    const world = new RiftWorld({
      components: [Position, Health],
      events: [],
    });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const e = server.spawn();
    e.set(Position, { x: 1, y: 2 });
    e.set(Health, { current: 100, max: 100 });

    // Only send Position, not Health
    server.setScope({
      visibleComponents: () => [Position],
    });

    syncToClient(server, client, "c1");
    const ce = client.entity(e.id)!;
    expect(ce.has(Position)).toBe(true);
    expect(ce.has(Health)).toBe(false);
  });
});

describe("flush interval", () => {
  it("throttles component updates", () => {
    const world = new RiftWorld({ components: [Position, Health], events: [] });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const e = server.spawn();
    e.set(Position, { x: 0, y: 0 });
    e.set(Health, { current: 100, max: 100 });

    // Initial sync
    syncToClient(server, client, "c1");

    // Position only every 4th flush
    server.setFlushInterval(Position, 4);

    // Tick 1-3: Position changes should NOT be sent
    e.get(Position).x = 10;
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)!.get(Position).x).toBeCloseTo(0); // still old

    // Health should still sync normally
    e.set(Health, { current: 80, max: 100 });
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)!.get(Health).current).toBe(80);

    // Skip tick 3
    e.get(Position).x = 20;
    syncToClient(server, client, "c1");

    // Tick 4: Position should now be sent
    e.get(Position).x = 30;
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)!.get(Position).x).toBeCloseTo(30);
  });

  it("reset to 1 restores default behavior", () => {
    const world = new RiftWorld({ components: [Position], events: [] });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const e = server.spawn();
    e.set(Position, { x: 0, y: 0 });
    syncToClient(server, client, "c1");

    server.setFlushInterval(Position, 4);
    server.setFlushInterval(Position, 1); // reset

    e.get(Position).x = 99;
    syncToClient(server, client, "c1");
    expect(client.entity(e.id)!.get(Position).x).toBeCloseTo(99);
  });
});

describe("client reactivity", () => {
  it("client entity reads are reactive", () => {
    const world = new RiftWorld({ components: [Position], events: [] });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const e = server.spawn();
    e.set(Position, { x: 0, y: 0 });
    syncToClient(server, client, "c1");

    const observed: number[] = [];
    const dispose = effect(() => {
      const ce = client.entity(e.id);
      if (ce) {
        observed.push(ce.get(Position).x);
      }
    });

    expect(observed).toEqual([0]);

    e.get(Position).x = 77;
    syncToClient(server, client, "c1");
    expect(observed).toEqual([0, 77]);

    dispose();
  });

  it("client queries work", () => {
    const world = new RiftWorld({
      components: [Position, IsEnemy],
      events: [],
    });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    const q = client.query(Position, IsEnemy);
    expect(q.value).toHaveLength(0);

    const e = server.spawn();
    e.set(Position, { x: 0, y: 0 });
    e.set(IsEnemy);
    syncToClient(server, client, "c1");

    expect(q.value).toHaveLength(1);
  });
});

describe("client management", () => {
  it("new client receives full world state", () => {
    const world = new RiftWorld({ components: [Position], events: [] });
    const server = new RiftServer(world);

    const e = server.spawn();
    e.set(Position, { x: 42, y: 0 });

    // First do a tick/flush without any clients
    server.tick();
    server.flush();

    // Now add a late-joining client
    server.addClient("late");
    const client = new RiftClient(world);
    syncToClient(server, client, "late");

    expect(client.entity(e.id)!.get(Position).x).toBeCloseTo(42);
  });

  it("removeClient stops producing packets", () => {
    const world = new RiftWorld({ components: [Position], events: [] });
    const server = new RiftServer(world);
    server.addClient("c1");

    server.removeClient("c1");
    server.tick();
    const packets = server.flush();
    expect(packets.has("c1")).toBe(false);
  });
});

describe("complex scenarios", () => {
  it("handles many entities with mixed operations", () => {
    const world = new RiftWorld({ components: [Position, Health], events: [] });
    const server = new RiftServer(world);
    const client = new RiftClient(world);
    server.addClient("c1");

    // Spawn several entities
    const entities = [];
    for (let i = 0; i < 10; i++) {
      const e = server.spawn();
      e.set(Position, { x: i * 10, y: i * 10 });
      if (i % 2 === 0) {
        e.set(Health, { current: 100, max: 100 });
      }
      entities.push(e);
    }
    syncToClient(server, client, "c1");

    // Verify all synced
    for (let i = 0; i < 10; i++) {
      const ce = client.entity(entities[i].id);
      expect(ce).toBeDefined();
      expect(ce!.get(Position).x).toBeCloseTo(i * 10);
    }

    // Mutate some, destroy some
    entities[0].get(Position).x = 999;
    server.destroy(entities[9]);
    entities[4].remove(Health);
    entities[5].set(Health, { current: 50, max: 50 });

    syncToClient(server, client, "c1");

    expect(client.entity(entities[0].id)!.get(Position).x).toBeCloseTo(999);
    expect(client.entity(entities[9].id)).toBeUndefined();
    expect(client.entity(entities[4].id)!.has(Health)).toBe(false);
    expect(client.entity(entities[5].id)!.has(Health)).toBe(true);
    expect(client.entity(entities[5].id)!.get(Health).current).toBe(50);
  });
});
