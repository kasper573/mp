import { describe, it, expect } from "vitest";
import type { Patch } from "../src/patch";
import { PatchType } from "../src/patch";
import { optimizePatch, PatchOptimizerBuilder } from "../src/patch-optimizer";

interface User {
  name: string;
  age: number;
  active?: boolean;
}

type State = {
  users: Record<string, User>;
  posts: Record<string, { title: string; published: boolean }>;
};

type CommentsState = {
  comments: Record<string, { text: string }>;
};

const filtersForState = new PatchOptimizerBuilder<State, {}>()
  .entity("users", (b) =>
    b
      .property("name", (b) => b.filter((a, b) => a === b))
      .property("age", (b) => b.filter((a) => a > 18)),
  )
  .entity("posts", (b) => b.property("published", (b) => b.filter(() => true)))
  .build();

const baseState: State = {
  users: Object.fromEntries([["1", { name: "Alice", age: 20, active: true }]]),
  posts: Object.fromEntries([["a", { title: "Hello", published: false }]]),
};

describe("filterPatchUpdates", () => {
  it("leaves Set and Remove operations unchanged", () => {
    const patch: Patch = [
      [PatchType.Set, ["users"], { foo: "bar" }],
      [PatchType.Remove, ["users", "1"]],
    ];

    const result = optimizePatch(baseState, patch, filtersForState, () => []);
    expect(result).toEqual(patch);
  });

  it("leaves updates for entities without a filter untouched", () => {
    const patch: Patch = [
      [PatchType.Update, ["comments", "42"], { text: "Hi" }],
    ];

    const stateWithComments: State & CommentsState = {
      ...baseState,
      comments: Object.fromEntries([["42", { text: "Original" }]]),
    };

    const result = optimizePatch<State & CommentsState, {}>(
      stateWithComments,
      patch,
      filtersForState,
      () => [],
    );
    expect(result).toEqual(patch);
  });

  it("leaves updates for entities not in state untouched", () => {
    const patch: Patch = [[PatchType.Update, ["users", "2"], { name: "Eve" }]];

    const result = optimizePatch(baseState, patch, filtersForState, () => []);
    expect(result).toEqual(patch);
  });

  it("removes properties that fail the filter and keeps others", () => {
    const patch: Patch = [
      [
        PatchType.Update,
        ["users", "1"],
        { name: "Bob", age: 17, active: false },
      ],
      [PatchType.Update, ["posts", "a"], { title: "New", published: true }],
    ];

    const result = optimizePatch(baseState, patch, filtersForState, () => []);
    expect(result).toEqual([
      [PatchType.Update, ["users", "1"], { active: false }],
      [PatchType.Update, ["posts", "a"], { title: "New", published: true }],
    ]);
  });

  it("does not mutate the original patch or nested objects", () => {
    const originalUpdate = { name: "Bob", age: 17, active: false };
    const patch: Patch = [[PatchType.Update, ["users", "1"], originalUpdate]];
    const copyOfPatch = structuredClone(patch);

    const result = optimizePatch(baseState, patch, filtersForState, () => []);

    expect(patch).toEqual(copyOfPatch);
    expect(result[0][2]).not.toBe(originalUpdate);
  });
});
