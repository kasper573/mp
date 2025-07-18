import { describe, it, expect, beforeEach } from "vitest";
import { CachedIndex } from "../src/cached";

interface TestItem {
  name: string;
  type: string;
  color: string;
}

describe("Cached", () => {
  let items: TestItem[];
  let dataSource: () => Iterable<TestItem>;
  let index: CachedIndex<TestItem, { type: string; color: string }>;

  beforeEach(() => {
    // start each test with a fresh data set
    items = [
      { name: "apple", type: "fruit", color: "red" },
      { name: "cherry", type: "fruit", color: "red" },
      { name: "banana", type: "fruit", color: "yellow" },
      { name: "cucumber", type: "vegetable", color: "green" },
    ];
    dataSource = () => items;
    index = new CachedIndex(dataSource, {
      type: (item) => item.type,
      color: (item) => item.color,
    });
  });

  it("access before build always returns the empty set", () => {
    const result = index.access({ type: "fruit" }).toArray();
    expect(result.length).toBe(0);
  });

  it("after build, access(key) returns all items matching that key", () => {
    index.build();
    const fruits = index.access({ type: "fruit" }).toArray();
    expect(fruits.length).toBe(3);
    for (const it of items.filter((i) => i.type === "fruit")) {
      expect(fruits.includes(it)).toBe(true);
    }
    const greens = index.access({ color: "green" }).toArray();
    expect(greens.length).toBe(1);
    expect(greens.includes(items.find((i) => i.color === "green")!)).toBe(true);
  });

  it("access with multiple constraints returns the intersection", () => {
    index.build();
    // fruits AND red
    const redFruits = index.access({ type: "fruit", color: "red" }).toArray();
    expect(redFruits.length).toBe(2);
    const expected = items.filter(
      (i) => i.type === "fruit" && i.color === "red",
    );
    for (const it of expected) {
      expect(redFruits.includes(it)).toBe(true);
    }
  });

  it("access returns empty set if any constraint has no matches", () => {
    index.build();
    // no blue vegetables
    const blueVeg = index
      .access({ type: "vegetable", color: "blue" })
      .toArray();
    expect(blueVeg.length).toBe(0);
  });

  it("clear causes subsequent access to return empty until next build", () => {
    index.build();
    expect(index.access({ type: "fruit" }).toArray().length).toBe(3);
    index.clear();
    expect(index.access({ type: "fruit" }).toArray().length).toBe(0);
  });

  it("after clearing and updating the dataSource, build rebuilds only the new data", () => {
    index.build();
    expect(index.access({ type: "vegetable" }).toArray().length).toBe(1);

    // mutate the source: drop cucumber, add carrot
    items = [
      { name: "apple", type: "fruit", color: "red" },
      { name: "banana", type: "fruit", color: "yellow" },
      { name: "carrot", type: "vegetable", color: "orange" },
    ];
    index.clear();
    index.build();

    // now only carrot is a vegetable
    const vegs = index.access({ type: "vegetable" }).toArray();
    expect(vegs.length).toBe(1);
    expect([...vegs][0].name).toBe("carrot");
  });
});
