import { mkdirSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeHeapSnapshot } from "node:v8";

export interface Scenario {
  readonly name: string;
  readonly setup?: () => void;
  readonly run: () => void;
}

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
  let iterations = 200_000;
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

export async function runProfiler(
  scenarios: readonly Scenario[],
  opts: { profilesDir: string; pkgRoot: string; argv?: readonly string[] },
): Promise<void> {
  const { filter, iterations, heap, list, top } = parseArgs(
    opts.argv ?? process.argv.slice(2),
  );
  if (list) {
    for (const s of scenarios) {
      process.stdout.write(`${s.name}\n`);
    }
    return;
  }
  const targets = filter
    ? scenarios.filter((s) => s.name.includes(filter))
    : scenarios;
  if (targets.length === 0) {
    process.stderr.write(`no scenarios match: ${filter}\n`);
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
    for (let i = 0; i < iterations; i++) {
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
      `\n=== ${s.name} — ${iterations} iter, ${elapsedMs.toFixed(1)} ms ` +
        `(${((elapsedMs * 1_000_000) / iterations).toFixed(0)} ns/iter), ` +
        `heapΔ ${((heapAfter - heapBefore) / 1024).toFixed(1)} KiB ===\n`,
    );
    process.stdout.write(
      selfTimeTable(result.profile, opts.pkgRoot)
        .split("\n")
        .slice(0, top + 2)
        .join("\n") + "\n",
    );

    if (heap) {
      const heapPath = resolve(opts.profilesDir, `${fileSafe}.heapsnapshot`);
      writeHeapSnapshot(heapPath);
      process.stdout.write(`heap snapshot → ${heapPath}\n`);
    }
  }
  process.stdout.write(`\nprofiles → ${opts.profilesDir}\n`);
}

export function hereDir(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}
