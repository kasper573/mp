import type { AnyModule } from "./types";

type ModuleSide = "client" | "server";

export function resolveModules(
  modules: AnyModule[],
  side: ModuleSide,
): AnyModule[] {
  const visited = new Set<AnyModule>();
  const active = new Set<AnyModule>();
  const path: AnyModule[] = [];
  const result: AnyModule[] = [];

  const visit = (module: AnyModule): void => {
    if (visited.has(module)) {
      return;
    }

    if (active.has(module)) {
      const startIndex = path.findIndex((entry) => entry === module);
      const cycle = [...path.slice(startIndex), module];
      throw new Error(`Circular dependency detected`, { cause: cycle });
    }

    active.add(module);
    path.push(module);

    for (const dependency of module.dependencies) {
      if (dependency[side] === undefined) {
        continue;
      }
      visit(dependency);
    }

    path.pop();
    active.delete(module);
    visited.add(module);
    if (module[side] !== undefined) {
      result.push(module);
    }
  };

  for (const module of modules) {
    visit(module);
  }

  return result;
}
