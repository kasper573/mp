import { createHash } from "node:crypto";
import {
  bench,
  boxplot,
  compact,
  do_not_optimize,
  group,
  run,
  summary,
} from "mitata";
import { defineSchema, type EntityId } from "../src/index";
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
import { RiftServer } from "../src/server";
import { createWorld } from "../src/world";

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

boxplot(() => {
  summary(() => {
    group("wire: primitives", () => {
      bench("writer u32 x1000", () => {
        const w = new Writer(4096);
        for (let i = 0; i < 1000; i++) {
          w.writeU32(i);
        }
        do_not_optimize(w.finish());
      });
      bench("writer f32 x1000", () => {
        const w = new Writer(4096);
        for (let i = 0; i < 1000; i++) {
          w.writeF32(i * 0.5);
        }
        do_not_optimize(w.finish());
      });
      bench("writer string x1000", () => {
        const w = new Writer(32768);
        for (let i = 0; i < 1000; i++) {
          w.writeString("player_001");
        }
        do_not_optimize(w.finish());
      });
      bench("reader u32 x1000", () => {
        const buf = new Writer(4096);
        for (let i = 0; i < 1000; i++) {
          buf.writeU32(i);
        }
        const bytes = buf.finish();
        const r = new Reader(bytes);
        for (let i = 0; i < 1000; i++) {
          do_not_optimize(r.readU32());
        }
      });
    });
  });
});

boxplot(() => {
  summary(() => {
    group("wire: composites", () => {
      bench("encode pos", () => {
        const w = new Writer(32);
        pos.encode(w, posValue);
        do_not_optimize(w.finish());
      });
      bench("decode pos", () => {
        do_not_optimize(pos.decode(new Reader(encodedPos)));
      });
      bench("encode entity", () => {
        const w = new Writer(128);
        entity.encode(w, entityValue);
        do_not_optimize(w.finish());
      });
      bench("decode entity", () => {
        do_not_optimize(entity.decode(new Reader(encodedEntity)));
      });
      bench("encode array<pos>(100)", () => {
        const w = new Writer(2048);
        arr100.encode(w, arr100Value);
        do_not_optimize(w.finish());
      });
      bench("decode array<pos>(100)", () => {
        do_not_optimize(arr100.decode(new Reader(encodedArr100)));
      });
    });
  });
});

boxplot(() => {
  summary(() => {
    group("schema", () => {
      bench("schema.digest()", () => do_not_optimize(schema.digest()));
    });
  });
});

boxplot(() => {
  summary(() => {
    group("world", () => {
      bench("create+add x1000", () => {
        const w = createWorld(schema);
        for (let i = 0; i < 1000; i++) {
          const e = w.create();
          w.add(e, posComp, { x: i, y: i });
        }
        do_not_optimize(w);
      });
      bench("query 1000/3-comp", () => {
        const w = createWorld(schema);
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
        do_not_optimize(count);
      });
      bench("mutate 1000 entities", () => {
        const w = createWorld(schema);
        const ids: EntityId[] = [];
        for (let i = 0; i < 1000; i++) {
          const e = w.create();
          w.add(e, posComp, { x: 0, y: 0 });
          ids.push(e);
        }
        for (const id of ids) {
          const p = w.get(id, posComp);
          if (p) {
            p.x = p.x + 1;
          }
        }
        do_not_optimize(w);
      });
    });
  });
});

boxplot(() => {
  summary(() => {
    group("server tick (no clients)", () => {
      bench("tick with 1000 mutated entities", () => {
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
            p.x = 1;
          }
        }
        server.tick(1 / 60);
        do_not_optimize(server);
      });
    });
  });
});

compact(async () => {
  await run();
});
