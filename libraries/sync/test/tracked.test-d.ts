import { expectTypeOf, it } from "vitest";
import { object, value } from "../src";

it("property schema turns Sets into ReadonlySet", () => {
  const Schema = object({
    prop: value<Set<string>>(),
  });

  expectTypeOf(Schema.$infer.prop).toEqualTypeOf<ReadonlySet<string>>();
});

it("property schema turns Array into ReadonlyArray", () => {
  const Schema = object({
    prop: value<Array<string>>(),
  });

  expectTypeOf(Schema.$infer.prop).toEqualTypeOf<ReadonlyArray<string>>();
});

it("property schema turns Map into ReadonlyMap", () => {
  const Schema = object({
    prop: value<Map<number, string>>(),
  });

  expectTypeOf(Schema.$infer.prop).toEqualTypeOf<ReadonlyMap<number, string>>();
});
