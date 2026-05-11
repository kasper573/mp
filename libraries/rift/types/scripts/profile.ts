import { mkdirSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeHeapSnapshot } from "node:v8";
import {
  array,
  bitflags,
  bool,
  bytes,
  enumOf,
  f32,
  f64,
  i32,
  object,
  Reader,
  string,
  tuple,
  u32,
  u64,
  u8,
  union,
  Writer,
} from "../src/index";

interface Scenario {
  readonly name: string;
  readonly setup?: () => void;
  readonly run: () => void;
}

const u32Ty = u32();
const f32Ty = f32();
const stringTy = string();
const posTy = object({ x: f32(), y: f32(), z: f32() });
const entityTy = object({
  pos: object({ x: f32(), y: f32(), z: f32() }),
  velocity: object({ dx: f32(), dy: f32() }),
  name: string(),
  exists: bool(),
  hp: i32(),
});
const arr100Ty = array(posTy);
const tupleTy = tuple(u8(), string(), f32());
const colorTy = enumOf("red", "green", "blue", "yellow");
const flag33Names = Array.from({ length: 33 }, (_, i) => `f${i}`);
const flags33Ty = bitflags(...flag33Names);
const unionTy = union({
  move: object({ dx: i32(), dy: i32() }),
  jump: object({ h: u32() }),
});
const bytesTy = bytes();
const u64Ty = u64();
const f64Ty = f64();

const posValue = { x: 1.5, y: 2.5, z: 3.5 };
const entityValue = {
  pos: posValue,
  velocity: { dx: 0.1, dy: 0.2 },
  name: "player_001",
  exists: true,
  hp: 100,
};
const arr100Value = Array.from({ length: 100 }, (_, i) => ({
  x: i,
  y: i * 2,
  z: i * 3,
}));
const tupleValue: [number, string, number] = [7, "hi", 1.25];
const flags33Value: Record<string, boolean> = (() => {
  const v: Record<string, boolean> = {};
  for (const f of flag33Names) {
    v[f] = Number(f.slice(1)) % 2 === 0;
  }
  return v;
})();
const bytesValue = (() => {
  const b = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    b[i] = i;
  }
  return b;
})();

function encodeOnce<T>(
  ty: { encode: (w: Writer, v: T) => void },
  v: T,
  cap: number,
): Uint8Array {
  const w = new Writer(cap);
  ty.encode(w, v);
  return w.finish();
}

const encodedPos = encodeOnce(posTy, posValue, 32);
const encodedEntity = encodeOnce(entityTy, entityValue, 128);
const encodedArr100 = encodeOnce(arr100Ty, arr100Value, 2048);
const encodedTuple = encodeOnce(tupleTy, tupleValue, 32);
const encodedUnion = encodeOnce(unionTy, { tag: "jump", value: { h: 5 } }, 32);
const encodedFlags33 = encodeOnce(flags33Ty, flags33Value, 16);
const encodedColor = encodeOnce(colorTy, "green", 16);
const encodedBytes = encodeOnce(bytesTy, bytesValue, 512);
const encodedU64 = (() => {
  const w = new Writer(16);
  u64Ty.encode(w, 0xffffffffffffffffn);
  return w.finish();
})();

const scenarios: readonly Scenario[] = [
  {
    name: "writer_u32_x1000",
    run() {
      const w = new Writer(4096);
      for (let i = 0; i < 1000; i++) {
        w.writeU32(i);
      }
      w.finish();
    },
  },
  {
    name: "writer_f32_x1000",
    run() {
      const w = new Writer(4096);
      for (let i = 0; i < 1000; i++) {
        w.writeF32(i * 0.5);
      }
      w.finish();
    },
  },
  {
    name: "writer_string_x1000",
    run() {
      const w = new Writer(32768);
      for (let i = 0; i < 1000; i++) {
        w.writeString("player_001");
      }
      w.finish();
    },
  },
  {
    name: "reader_u32_x1000",
    run() {
      const b = new Writer(4096);
      for (let i = 0; i < 1000; i++) {
        b.writeU32(i);
      }
      const bytes = b.finish();
      const r = new Reader(bytes);
      let s = 0;
      for (let i = 0; i < 1000; i++) {
        s += r.readU32();
      }
      if (s < 0) {
        throw new Error();
      }
    },
  },
  {
    name: "encode_pos",
    run() {
      const w = new Writer(32);
      posTy.encode(w, posValue);
      w.finish();
    },
  },
  {
    name: "decode_pos",
    run() {
      posTy.decode(new Reader(encodedPos));
    },
  },
  {
    name: "encode_entity",
    run() {
      const w = new Writer(128);
      entityTy.encode(w, entityValue);
      w.finish();
    },
  },
  {
    name: "decode_entity",
    run() {
      entityTy.decode(new Reader(encodedEntity));
    },
  },
  {
    name: "encode_array100_pos",
    run() {
      const w = new Writer(2048);
      arr100Ty.encode(w, arr100Value);
      w.finish();
    },
  },
  {
    name: "decode_array100_pos",
    run() {
      arr100Ty.decode(new Reader(encodedArr100));
    },
  },
  {
    name: "encode_tuple",
    run() {
      const w = new Writer(32);
      tupleTy.encode(w, tupleValue);
      w.finish();
    },
  },
  {
    name: "decode_tuple",
    run() {
      tupleTy.decode(new Reader(encodedTuple));
    },
  },
  {
    name: "encode_union",
    run() {
      const w = new Writer(32);
      unionTy.encode(w, { tag: "jump", value: { h: 5 } });
      w.finish();
    },
  },
  {
    name: "decode_union",
    run() {
      unionTy.decode(new Reader(encodedUnion));
    },
  },
  {
    name: "encode_bitflags33",
    run() {
      const w = new Writer(16);
      flags33Ty.encode(w, flags33Value);
      w.finish();
    },
  },
  {
    name: "decode_bitflags33",
    run() {
      flags33Ty.decode(new Reader(encodedFlags33));
    },
  },
  {
    name: "encode_enum",
    run() {
      const w = new Writer(8);
      colorTy.encode(w, "green");
      w.finish();
    },
  },
  {
    name: "decode_enum",
    run() {
      colorTy.decode(new Reader(encodedColor));
    },
  },
  {
    name: "encode_bytes256",
    run() {
      const w = new Writer(512);
      bytesTy.encode(w, bytesValue);
      w.finish();
    },
  },
  {
    name: "decode_bytes256",
    run() {
      bytesTy.decode(new Reader(encodedBytes));
    },
  },
  {
    name: "decode_u64",
    run() {
      u64Ty.decode(new Reader(encodedU64));
    },
  },
  {
    name: "u32_encode_primitive_type",
    run() {
      const w = new Writer(8);
      u32Ty.encode(w, 0xdeadbeef);
      w.finish();
    },
  },
  {
    name: "f32_encode_primitive_type",
    run() {
      const w = new Writer(8);
      f32Ty.encode(w, 1.5);
      w.finish();
    },
  },
  {
    name: "string_encode_primitive_type",
    run() {
      const w = new Writer(32);
      stringTy.encode(w, "player_001");
      w.finish();
    },
  },
  {
    name: "entity_digest",
    run() {
      const w = new Writer(256);
      entityTy.digest(w);
      w.finish();
    },
  },
  {
    name: "f64_decode",
    run() {
      const w = new Writer(16);
      f64Ty.encode(w, Math.PI);
      f64Ty.decode(new Reader(w.finish()));
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
  let iterations = 10_000;
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
