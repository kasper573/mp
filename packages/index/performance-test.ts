// oxlint-disable no-console
import { performance } from "perf_hooks";
import type { IndexResolvers, IndexQuery } from "./src/types";
import { UncachedIndex } from "./src/uncached";
import { CachedIndex } from "./src/cached";

// ---- 1) Generate synthetic data ----
interface Item {
  id: number;
  category: string;
  tag: string;
}

const NUM_ITEMS = 100_000;
const NUM_QUERIES = 1_000;

// helper to pick a random element
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const categories = ["A", "B", "C", "D", "E"];
const tags = ["red", "blue", "green", "yellow", "black"];

// build an array of items
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

// ---- 3) Instantiate both indices ----
const cached = new CachedIndex<Item, Def>(dataSource, resolvers);
const uncached = new UncachedIndex<Item, Def>(dataSource, resolvers);

// ---- 4) Benchmark build() ----
let t0 = performance.now();
cached.build();
const cachedBuildMs = performance.now() - t0;

// for fairness, “warm up” the uncached build (it's a no-op)
t0 = performance.now();
uncached.build();
const uncachedBuildMs = performance.now() - t0;

// ---- 5) Prepare random queries ----
const queries: IndexQuery<Def>[] = Array.from({ length: NUM_QUERIES }, () => {
  const q: Partial<Def> = {};
  // randomly constrain one or both fields
  if (Math.random() < 0.8) q.category = pick(categories);
  if (Math.random() < 0.5) q.tag = pick(tags);
  return q;
});

// helper to fully exhaust a generator
function drain<T>(gen: Generator<T>) {
  for (const _ of gen) {
    // noop
  }
}

// ---- 6) Benchmark accessing() ----
t0 = performance.now();
for (const q of queries) {
  drain(cached.access(q));
}
const cachedQueryMs = performance.now() - t0;

t0 = performance.now();
for (const q of queries) {
  drain(uncached.access(q));
}
const uncachedQueryMs = performance.now() - t0;

// ---- 7) Report ----

console.log("--- Benchmark Results ---");
console.log(`Items:           ${NUM_ITEMS.toLocaleString()}`);
console.log(`Queries:         ${NUM_QUERIES.toLocaleString()}`);
console.log("");
console.log(`CachedIndex.build():   ${cachedBuildMs.toFixed(2)} ms`);
console.log(`UncachedIndex.build(): ${uncachedBuildMs.toFixed(2)} ms (noop)`);
console.log("");
console.log(`CachedIndex.query():   ${cachedQueryMs.toFixed(2)} ms total`);
console.log(`UncachedIndex.query(): ${uncachedQueryMs.toFixed(2)} ms total`);
console.log(`→ per query:`);
console.log(`    Cached:   ${(cachedQueryMs / NUM_QUERIES).toFixed(4)} ms`);
console.log(`    Uncached: ${(uncachedQueryMs / NUM_QUERIES).toFixed(4)} ms`);
