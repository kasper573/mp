import { bench, group, run, compact } from "mitata";
import {
  type Entity,
  RiftWorld,
  RiftServer,
  RiftClient,
  struct,
  f32,
  u32,
  string,
  array,
  tag,
} from "../src/index";

const Position = struct({ x: f32(), y: f32() });
const Health = struct({ current: u32(), max: u32() });
const Name = string();
const Inventory = array(u32());
const IsEnemy = tag();

group("type encode/decode", () => {
  const pos = { x: 42.5, y: 99.1 };
  const encoded = Position.encode(pos);

  bench("struct encode", () => Position.encode(pos));
  bench("struct decode", () => Position.decode(encoded));

  const inv = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const invEncoded = Inventory.encode(inv);

  bench("array encode (10 items)", () => Inventory.encode(inv));
  bench("array decode (10 items)", () => Inventory.decode(invEncoded));

  bench("scalar encode", () => Name.encode("hello world"));
  const nameEncoded = Name.encode("hello world");
  bench("scalar decode", () => Name.decode(nameEncoded));
});

group("struct delta", () => {
  const oldVal = { x: 0, y: 0 };
  const newVal = { x: 42, y: 0 };
  const noChange = { x: 0, y: 0 };

  bench("delta (1 field changed)", () => Position.encodeDelta(oldVal, newVal));
  bench("delta (no change)", () => Position.encodeDelta(oldVal, noChange));
});

group("entity operations", () => {
  const world = new RiftWorld({ components: [Position, Health, IsEnemy] });
  const server = new RiftServer(world);

  bench("spawn + add components", () => {
    const e = server.spawn();
    e.set(Position, { x: 0, y: 0 });
    e.set(Health, { current: 100, max: 100 });
    return e;
  });

  const entity = server.spawn();
  entity.set(Position, { x: 10, y: 20 });

  bench("get struct proxy + read", () => {
    const pos = entity.get(Position);
    return pos.x + pos.y;
  });

  bench("get struct proxy + write", () => {
    const pos = entity.get(Position);
    pos.x = Math.random();
  });
});

group("server flush (100 entities)", () => {
  const world = new RiftWorld({
    components: [Position, Health],
  });
  const server = new RiftServer(world);
  const client = new RiftClient(world);
  server.addClient("c1");

  for (let i = 0; i < 100; i++) {
    const e = server.spawn();
    e.set(Position, { x: i, y: i });
    e.set(Health, { current: 100, max: 100 });
  }

  // Initial sync
  server.tick();
  const initialPackets = server.flush();
  const initialBuf = initialPackets.get("c1") ?? new Uint8Array();
  client.apply(initialBuf);

  bench("initial full sync (encode)", () => {
    // Re-create to measure full sync
    const s = new RiftServer(world);
    s.addClient("c1");
    for (let i = 0; i < 100; i++) {
      const e = s.spawn();
      e.set(Position, { x: i, y: i });
      e.set(Health, { current: 100, max: 100 });
    }
    s.tick();
    return s.flush();
  });

  bench("client apply (initial sync)", () => {
    const c = new RiftClient(world);
    c.apply(initialBuf);
  });
});

group("server flush (delta, 10% dirty)", () => {
  const world = new RiftWorld({
    components: [Position, Health],
  });
  const server = new RiftServer(world);
  server.addClient("c1");

  const entities: Entity[] = [];
  for (let i = 0; i < 100; i++) {
    const e = server.spawn();
    e.set(Position, { x: i, y: i });
    e.set(Health, { current: 100, max: 100 });
    entities.push(e);
  }

  server.tick();
  server.flush();

  bench("tick + flush (10 dirty)", () => {
    for (let i = 0; i < 10; i++) {
      entities[i].get(Position).x = Math.random();
    }
    server.tick();
    return server.flush();
  });
});

group("spawn 1000 entities", () => {
  bench("spawn 1000 entities", () => {
    const world = new RiftWorld({ components: [Position, Health] });
    const server = new RiftServer(world);
    for (let i = 0; i < 1000; i++) {
      const e = server.spawn();
      e.set(Position, { x: i, y: i });
      e.set(Health, { current: 100, max: 100 });
    }
  });
});

compact(async () => {
  await run();
});
