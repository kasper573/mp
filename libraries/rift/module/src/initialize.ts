import { getDeps } from "./internal";
import { RiftModule } from "./module";
import type { Class, Cleanup } from "./types";

export async function initializeModules(
  modules: readonly object[],
): Promise<Cleanup> {
  const byClass = indexByClass(modules);
  const order = topoSort(modules, byClass);

  const cleanups: Cleanup[] = [];
  for (const mod of order) {
    inject(mod, byClass);
    if (!(mod instanceof RiftModule)) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- sequential init respects dep order
    const result = await mod.init();
    if (typeof result === "function") {
      cleanups.push(result);
    }
  }

  return async function cleanup() {
    for (const fn of cleanups.toReversed()) {
      // oxlint-disable-next-line no-await-in-loop -- sequential teardown in reverse dep order
      await fn();
    }
  };
}

function indexByClass(modules: readonly object[]): Map<Class, object> {
  const byClass = new Map<Class, object>();
  for (const mod of modules) {
    const ctor = mod.constructor as Class;
    if (byClass.has(ctor)) {
      throw new Error(`Duplicate module instance for class "${ctor.name}"`);
    }
    byClass.set(ctor, mod);
  }
  return byClass;
}

function inject(mod: object, byClass: Map<Class, object>): void {
  const deps = getDeps(mod);
  if (!deps) {
    return;
  }
  for (const [, entry] of deps) {
    const dep = byClass.get(entry.cls);
    if (!dep) {
      throw new Error(
        `Module "${mod.constructor.name}" depends on "${entry.cls.name}", which was not provided`,
      );
    }
    entry.set(mod, dep);
  }
}

function topoSort(
  modules: readonly object[],
  byClass: Map<Class, object>,
): object[] {
  const order: object[] = [];
  const visiting = new Set<object>();
  const done = new Set<object>();

  function visit(mod: object, path: readonly string[]): void {
    if (done.has(mod)) {
      return;
    }
    const name = mod.constructor.name;
    if (visiting.has(mod)) {
      throw new Error(`Dependency cycle: ${[...path, name].join(" -> ")}`);
    }
    visiting.add(mod);
    const deps = getDeps(mod);
    if (deps) {
      const nextPath = [...path, name];
      for (const entry of deps.values()) {
        const dep = byClass.get(entry.cls);
        if (!dep) {
          throw new Error(
            `Module "${name}" depends on "${entry.cls.name}", which was not provided`,
          );
        }
        visit(dep, nextPath);
      }
    }
    visiting.delete(mod);
    done.add(mod);
    order.push(mod);
  }

  for (const mod of modules) {
    visit(mod, []);
  }
  return order;
}
