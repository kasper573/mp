import { expectTypeOf, it } from "vitest";
import { object, prop } from "../src";

it("property schema turns Sets into ReadonlySet", () => {
  const Schema = object({
    prop: prop<Set<string>>(),
  });

  expectTypeOf(Schema.$infer.prop).toEqualTypeOf<
    Readonly<ReadonlySet<string>>
  >();
});

it("property schema turns Array into ReadonlyArray", () => {
  const Schema = object({
    prop: prop<Array<string>>(),
  });

  expectTypeOf(Schema.$infer.prop).toEqualTypeOf<ReadonlyArray<string>>();
});

it("property schema turns Map into ReadonlyMap", () => {
  const Schema = object({
    prop: prop<Map<number, string>>(),
  });

  expectTypeOf(Schema.$infer.prop).toEqualTypeOf<
    Readonly<ReadonlyMap<number, string>>
  >();
});
