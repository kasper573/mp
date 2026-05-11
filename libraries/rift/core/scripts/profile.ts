import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeHeapSnapshot } from "node:v8";
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

interface Scenario {
  readonly name: string;
  readonly setup?: () => void;
  readonly run: () => void;
}

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

interface ProfileNode {
  id: number;
  hitCount?: number;
  callFrame: {
    functionName: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  children?: number[];
}

interface CpuProfile {
  nodes: ProfileNode[];
  samples: number[];
  timeDeltas: number[];
  startTime: number;
  endTime: number;
}

function parseArgs(argv: readonly string[]): {
  filter?: string;
  iterations: number;
  heap: boolean;
  list: boolean;
  top: number;
} {
  let filter: string | undefined;
  let iterations = 5_000;
  let heap = false;
  let list = false;
  let top = 25;
  for (const a of argv) {
    if (a === "--list") {
      list = true;
    } else if (a === "--heap") {
      heap = true;
    } else if (a.startsWith("--filter=")) {
      filter = a.slice("--filter=".length);
    } else if (a.startsWith("--iterations=")) {
      iterations = Number(a.slice("--iterations=".length));
    } else if (a.startsWith("--top=")) {
      top = Number(a.slice("--top=".length));
    }
  }
  return { filter, iterations, heap, list, top };
}

function padCell(s: string, width: number, right: boolean): string {
  return right ? s.padEnd(width) : s.padStart(width);
}

function selfTimeTable(profile: CpuProfile, pkgRoot: string): string {
  const byId = new Map<number, ProfileNode>();
  for (const n of profile.nodes) {
    byId.set(n.id, n);
  }
  const selfUs = new Map<number, number>();
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    selfUs.set(id, (selfUs.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0));
  }
  const total =
    [...selfUs.values()].reduce((a, b) => a + b, 0) ||
    profile.endTime - profile.startTime;
  const entries = [...selfUs.entries()]
    .map(([id, us]) => {
      const n = byId.get(id);
      if (!n) {
        return undefined;
      }
      const cf = n.callFrame;
      const fn = cf.functionName || "(anon)";
      let url = cf.url || "";
      if (url.startsWith("file://")) {
        url = fileURLToPath(url);
      }
      if (url.startsWith(pkgRoot)) {
        url = url.slice(pkgRoot.length + 1);
      }
      const loc = url ? `${url}:${cf.lineNumber + 1}` : "(vm)";
      return {
        fn,
        loc,
        us,
        hits: n.hitCount ?? 0,
        pct: total === 0 ? 0 : (us * 100) / total,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== undefined)
    .sort((a, b) => b.us - a.us);
  const hdr = ["self%", "self_ms", "hits", "function", "location"];
  const rows = entries.map((e) => [
    e.pct.toFixed(2),
    (e.us / 1000).toFixed(2),
    String(e.hits),
    e.fn,
    e.loc,
  ]);
  const widths = hdr.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const lines = [
    hdr.map((h, i) => padCell(h, widths[i], i >= 3)).join("  "),
    widths.map((w) => "-".repeat(w)).join("  "),
    ...rows.map((r) =>
      r.map((c, i) => padCell(c, widths[i], i >= 3)).join("  "),
    ),
  ];
  return lines.join("\n");
}

async function runProfiler(
  list: readonly Scenario[],
  opts: { profilesDir: string; pkgRoot: string; argv?: readonly string[] },
): Promise<void> {
  const args = parseArgs(opts.argv ?? process.argv.slice(2));
  if (args.list) {
    for (const s of list) {
      process.stdout.write(`${s.name}\n`);
    }
    return;
  }
  const targets = args.filter
    ? list.filter((s) => s.name.includes(args.filter ?? ""))
    : list;
  if (targets.length === 0) {
    process.stderr.write(`no scenarios match: ${args.filter}\n`);
    process.exit(1);
  }
  mkdirSync(opts.profilesDir, { recursive: true });

  for (const s of targets) {
    s.setup?.();
    for (let i = 0; i < 1000; i++) {
      s.run();
    }
    globalThis.gc?.();

    const session = new Session();
    session.connect();
    // eslint-disable-next-line no-await-in-loop
    await session.post("Profiler.enable");
    // eslint-disable-next-line no-await-in-loop
    await session.post("Profiler.setSamplingInterval", { interval: 50 });
    // eslint-disable-next-line no-await-in-loop
    await session.post("Profiler.start");
    const t0 = performance.now();
    const heapBefore = process.memoryUsage().heapUsed;
    for (let i = 0; i < args.iterations; i++) {
      s.run();
    }
    const elapsedMs = performance.now() - t0;
    const heapAfter = process.memoryUsage().heapUsed;
    // eslint-disable-next-line no-await-in-loop
    const result = (await session.post("Profiler.stop")) as {
      profile: CpuProfile;
    };
    // eslint-disable-next-line no-await-in-loop
    await session.post("Profiler.disable");
    session.disconnect();

    const fileSafe = s.name.replace(/[^a-z0-9]+/gi, "_");
    const cpuPath = resolve(opts.profilesDir, `${fileSafe}.cpuprofile`);
    writeFileSync(cpuPath, JSON.stringify(result.profile));
    process.stdout.write(
      `\n=== ${s.name} — ${args.iterations} iter, ${elapsedMs.toFixed(1)} ms ` +
        `(${((elapsedMs * 1_000_000) / args.iterations).toFixed(0)} ns/iter), ` +
        `heapΔ ${((heapAfter - heapBefore) / 1024).toFixed(1)} KiB ===\n`,
    );
    process.stdout.write(
      selfTimeTable(result.profile, opts.pkgRoot)
        .split("\n")
        .slice(0, args.top + 2)
        .join("\n") + "\n",
    );

    if (args.heap) {
      const heapPath = resolve(opts.profilesDir, `${fileSafe}.heapsnapshot`);
      writeHeapSnapshot(heapPath);
      process.stdout.write(`heap snapshot → ${heapPath}\n`);
    }
  }
  process.stdout.write(`\nprofiles → ${opts.profilesDir}\n`);
}
