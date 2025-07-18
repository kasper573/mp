// oxlint-disable no-console
import { performance } from "perf_hooks";
import type { IndexResolvers, IndexQuery } from "./src/types";
import { UncachedIndex } from "./src/uncached";
import { CachedIndex } from "./src/cached";
import { ComputedIndex } from "./src";

// ---- 1) Generate synthetic data ----
interface Item {
  id: number;
  category: string;
  tag: string;
}

const NUM_ITEMS = 100_000;
const NUM_QUERIES = 1_000;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const categories = ["A", "B", "C", "D", "E"];
const tags = ["red", "blue", "green", "yellow", "black"];

const allItems: Item[] = Array.from({ length: NUM_ITEMS }, (_, i) => ({
  id: i,
  category: pick(categories),
  tag: pick(tags),
}));

// dataSource just returns the iterable
const dataSource = () => allItems;

// ---- 2) Define your index (two‐field) ----
// oxlint-disable-next-line consistent-type-definitions
type Def = {
  category: string;
  tag: string;
};
const resolvers: IndexResolvers<Item, Def> = {
  category: (item) => item.category,
  tag: (item) => item.tag,
};

// ---- 3) Configure providers ----
interface Provider<I, D> {
  name: string;
  instance: {
    build: () => void;
    access: (q: Partial<D>) => Generator<I>;
  };
}

const providers: Provider<Item, Def>[] = [
  {
    name: "CachedIndex",
    instance: new CachedIndex<Item, Def>(dataSource, resolvers),
  },
  {
    name: "UncachedIndex",
    instance: new UncachedIndex<Item, Def>(dataSource, resolvers),
  },
  {
    name: "ComputedIndex",
    instance: new ComputedIndex<Item, Def>(dataSource, resolvers),
  },
  // Add new providers here:
  // { name: "MyOtherIndex", instance: new MyOtherIndex(dataSource, resolvers) },
];

// ---- 4) Benchmark build() ----
const buildTimes: Record<string, number> = {};
for (const { name, instance } of providers) {
  const t0 = performance.now();
  instance.build();
  buildTimes[name] = performance.now() - t0;
}

// ---- 5) Prepare random queries ----
const queries: IndexQuery<Def>[] = Array.from({ length: NUM_QUERIES }, () => {
  const q: Partial<Def> = {};
  q.category = pick(categories);
  if (Math.random() < 0.5) q.tag = pick(tags);
  return q;
});

// helper to fully exhaust a generator
function drain<T>(gen: Generator<T>) {
  for (const _ of gen) {
    // noop
  }
}

// ---- 6) Benchmark queries ----
const queryTimes: Record<string, number> = {};
for (const { name, instance } of providers) {
  const t0 = performance.now();
  for (const q of queries) {
    drain(instance.access(q));
  }
  queryTimes[name] = performance.now() - t0;
}

// ---- 7) Report ----
console.log("--- Benchmark Results ---");
console.log(`Items:           ${NUM_ITEMS.toLocaleString()}`);
console.log(`Queries:         ${NUM_QUERIES.toLocaleString()}`);
console.log("");
for (const { name } of providers) {
  console.log(`${name}.build():   ${buildTimes[name].toFixed(2)} ms`);
}
console.log("");
for (const { name } of providers) {
  const total = queryTimes[name];
  console.log(`${name}.query():   ${total.toFixed(2)} ms total`);
  console.log(`→ per query: ${(total / NUM_QUERIES).toFixed(4)} ms`);
}
