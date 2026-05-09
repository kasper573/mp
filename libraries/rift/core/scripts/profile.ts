import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  array,
  bool,
  f32,
  i32,
  object,
  Reader,
  string,
  u32,
  Writer,
} from "@rift/types";
import { defineSchema, type EntityId } from "../src/index";
import { RiftServer } from "../src/server";
import { World } from "../src/world";
import {
  runProfiler,
  type Scenario,
} from "../../types/scripts/profile-harness";

function sha256(input: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(input).digest());
}

const pos = object({ x: f32(), y: f32(), z: f32() });
const entity = object({
  pos: object({ x: f32(), y: f32(), z: f32() }),
  velocity: object({ dx: f32(), dy: f32() }),
  name: string(),
  alive: bool(),
  hp: i32(),
});
const arr100 = array(pos);
const posValue = { x: 1.5, y: 2.5, z: 3.5 };
const entityValue = {
  pos: posValue,
  velocity: { dx: 0.1, dy: 0.2 },
  name: "player_001",
  alive: true,
  hp: 100,
};
const arr100Value = Array.from({ length: 100 }, (_, i) => ({
  x: i,
  y: i * 2,
  z: i * 3,
}));
const encodedPos = (() => {
  const w = new Writer(32);
  pos.encode(w, posValue);
  return w.finish();
})();
const encodedEntity = (() => {
  const w = new Writer(128);
  entity.encode(w, entityValue);
  return w.finish();
})();
const encodedArr100 = (() => {
  const w = new Writer(2048);
  arr100.encode(w, arr100Value);
  return w.finish();
})();

const posComp = object({ x: f32(), y: f32() });
const velocityComp = object({ dx: f32(), dy: f32() });
const nameComp = string();
const hpComp = u32();

const schema = defineSchema({
  components: [posComp, velocityComp, nameComp, hpComp],
  events: [],
  hash: sha256,
});

const scenarios: readonly Scenario[] = [
  {
    name: "encode_pos",
    run() {
      const w = new Writer(32);
      pos.encode(w, posValue);
      w.finish();
    },
  },
  {
    name: "decode_pos",
    run() {
      pos.decode(new Reader(encodedPos));
    },
  },
  {
    name: "encode_entity",
    run() {
      const w = new Writer(128);
      entity.encode(w, entityValue);
      w.finish();
    },
  },
  {
    name: "decode_entity",
    run() {
      entity.decode(new Reader(encodedEntity));
    },
  },
  {
    name: "encode_array100_pos",
    run() {
      const w = new Writer(2048);
      arr100.encode(w, arr100Value);
      w.finish();
    },
  },
  {
    name: "decode_array100_pos",
    run() {
      arr100.decode(new Reader(encodedArr100));
    },
  },
  {
    name: "schema_digest",
    run() {
      schema.digest();
    },
  },
  {
    name: "world_create_add_1000",
    run() {
      const w = new World(schema);
      for (let i = 0; i < 1000; i++) {
        const e = w.create();
        w.add(e, posComp, { x: i, y: i });
      }
    },
  },
  {
    name: "world_query_1000_3comp",
    run() {
      const w = new World(schema);
      for (let i = 0; i < 1000; i++) {
        const e = w.create();
        w.add(e, posComp, { x: i, y: i });
        w.add(e, velocityComp, { dx: 0, dy: 0 });
        if (i % 2 === 0) {
          w.add(e, nameComp, `n${i}`);
        }
      }
      let count = 0;
      for (const _row of w.query(posComp, velocityComp).exclude(nameComp)) {
        count++;
      }
      if (count < 0) {
        throw new Error();
      }
    },
  },
  {
    name: "world_mutate_1000",
    run() {
      const w = new World(schema);
      const ids: EntityId[] = [];
      for (let i = 0; i < 1000; i++) {
        const e = w.create();
        w.add(e, posComp, { x: 0, y: 0 });
        ids.push(e);
      }
      for (const id of ids) {
        const p = w.get(id, posComp);
        if (p) {
          (p as { x: number }).x = (p as { x: number }).x + 1;
        }
      }
    },
  },
  {
    name: "server_tick_1000_mutated",
    run() {
      const server = new RiftServer({
        schema,
        transport: {
          on: () => () => {},
          send: () => {},
          close: () => {},
          shutdown: async () => {},
        },
        tickRateHz: 0,
      });
      const ids: EntityId[] = [];
      for (let i = 0; i < 1000; i++) {
        const e = server.world.create();
        server.world.add(e, posComp, { x: 0, y: 0 });
        ids.push(e);
      }
      for (const id of ids) {
        const p = server.world.get(id, posComp);
        if (p) {
          (p as { x: number }).x = 1;
        }
      }
      server.tick(1 / 60);
    },
  },
];

const here = dirname(fileURLToPath(import.meta.url));
const profilesDir = resolve(here, "..", "profiles");
const pkgRoot = resolve(here, "..");
await runProfiler(scenarios, { profilesDir, pkgRoot });
