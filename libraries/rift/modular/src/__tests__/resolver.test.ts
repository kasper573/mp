import { describe, expect, test } from "vitest";
import { defineModule } from "../define-module";
import { resolveModules } from "../resolver";

describe("resolveModules", () => {
  test("returns modules in dependency order", () => {
    const a = defineModule({
      server: () => ({ api: {} }),
    });
    const b = defineModule({
      dependencies: [a] as const,
      server: () => ({ api: {} }),
    });
    const c = defineModule({
      dependencies: [b] as const,
      server: () => ({ api: {} }),
    });

    expect(resolveModules([c], "server")).toEqual([a, b, c]);
  });

  test("filters modules without the requested side", () => {
    const clientOnly = defineModule({
      client: () => ({ api: {} }),
    });

    expect(resolveModules([clientOnly], "server")).toEqual([]);
  });

  test("resolves same-side dependencies through a root without that side", () => {
    const clientOnly = defineModule({
      client: () => ({ api: {} }),
    });
    const root = defineModule({
      dependencies: [clientOnly] as const,
      server: () => ({ api: {} }),
    });

    expect(resolveModules([root], "client")).toEqual([clientOnly]);
  });

  test("includes transitive dependencies once when roots overlap", () => {
    const dependency = defineModule({
      server: () => ({ api: {} }),
    });
    const module = defineModule({
      dependencies: [dependency] as const,
      server: () => ({ api: {} }),
    });

    expect(resolveModules([dependency, module], "server")).toEqual([
      dependency,
      module,
    ]);
  });

  test("ignores dependencies that only exist on the other side", () => {
    const clientOnly = defineModule({
      client: () => ({ api: {} }),
    });
    const module = defineModule({
      dependencies: [clientOnly] as const,
      client: () => ({ api: {} }),
      server: () => ({ api: {} }),
    });

    expect(resolveModules([module], "server")).toEqual([module]);
    expect(resolveModules([module], "client")).toEqual([clientOnly, module]);
  });

  test("throws on circular dependency", () => {
    const a = defineModule({
      dependencies: [] as const,
      server: () => ({ api: {} }),
    });
    const b = defineModule({
      dependencies: [a] as const,
      server: () => ({ api: {} }),
    });

    Object.assign(a, {
      dependencies: [b] as const,
    });

    expect(() => resolveModules([a, b], "server")).toThrow(
      "Circular dependency detected",
    );
  });

  test("handles empty input", () => {
    expect(resolveModules([], "client")).toEqual([]);
  });
});
