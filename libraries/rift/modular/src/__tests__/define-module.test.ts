import { expect, expectTypeOf, test } from "vitest";
import { defineModule } from "../define-module";

test("defineModule preserves dependencies", () => {
  const dependency = defineModule({
    client: () => ({ api: { version: 1 } }),
  });

  const module = defineModule({
    dependencies: [dependency] as const,
    client: (ctx) => ({
      api: {
        depVersion: ctx.using(dependency).version,
      },
    }),
    server: () => ({
      api: {
        ready: true,
      },
    }),
  });

  expect(module.dependencies).toEqual([dependency]);
  expectTypeOf(module.dependencies).toEqualTypeOf<
    readonly [typeof dependency]
  >();
});
