import { describe, it, expect } from "vitest";
import type { Patch } from "../src/patch";
import { PatchType } from "../src/patch";
import type { PatchFilter } from "../src/filter-patch";
import { filterPatch } from "../src/filter-patch";

interface User {
  name: string;
  age: number;
  active?: boolean;
}

type State = {
  users: { [id: string]: User };
  posts: { [id: string]: { title: string; published: boolean } };
};

type CommentsState = {
  comments: { [id: string]: { text: string } };
};

const filtersForState: PatchFilter<State> = {
  users: {
    name: (newVal, oldVal) => newVal === oldVal,
    age: (newVal) => newVal > 18,
  },
  posts: {
    published: () => true,
  },
};

const baseState: State = {
  users: {
    "1": { name: "Alice", age: 20, active: true },
  },
  posts: {
    a: { title: "Hello", published: false },
  },
};

describe("filterPatchUpdates", () => {
  it("leaves Set and Remove operations unchanged", () => {
    const patch: Patch = [
      [PatchType.Set, ["users"], { foo: "bar" }],
      [PatchType.Remove, ["users", "1"]],
    ];

    const result = filterPatch(baseState, patch, filtersForState);
    expect(result).toEqual(patch);
  });

  it("leaves updates for entities without a filter untouched", () => {
    const patch: Patch = [
      [PatchType.Update, ["comments", "42"], { text: "Hi" }],
    ];

    const stateWithComments: State & CommentsState = {
      ...baseState,
      comments: { "42": { text: "Original" } },
    };

    const result = filterPatch<State & CommentsState>(
      stateWithComments,
      patch,
      filtersForState,
    );
    expect(result).toEqual(patch);
  });

  it("leaves updates for entities not in state untouched", () => {
    const patch: Patch = [[PatchType.Update, ["users", "2"], { name: "Eve" }]];

    const result = filterPatch(baseState, patch, filtersForState);
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

    const result = filterPatch(baseState, patch, filtersForState);
    expect(result).toEqual([
      [PatchType.Update, ["users", "1"], { active: false }],
      [PatchType.Update, ["posts", "a"], { title: "New", published: true }],
    ]);
  });

  it("does not mutate the original patch or nested objects", () => {
    const originalUpdate = { name: "Bob", age: 17, active: false };
    const patch: Patch = [[PatchType.Update, ["users", "1"], originalUpdate]];
    const copyOfPatch = structuredClone(patch);

    const result = filterPatch(baseState, patch, filtersForState);

    expect(patch).toEqual(copyOfPatch);
    expect(result[0][2]).not.toBe(originalUpdate);
  });
});
