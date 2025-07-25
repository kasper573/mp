import { describe, it, expect, beforeEach } from "vitest";
import { Index } from "../src";

interface TestItem {
  name: string;
  type: string;
  color: string;
}

describe("Computed", () => {
  let items: TestItem[];
  let dataSource: () => Iterable<TestItem>;
  let index: Index<TestItem, { type: string; color: string }>;

  beforeEach(() => {
    // start each test with a fresh data set
    items = [
      { name: "apple", type: "fruit", color: "red" },
      { name: "cherry", type: "fruit", color: "red" },
      { name: "banana", type: "fruit", color: "yellow" },
      { name: "cucumber", type: "vegetable", color: "green" },
    ];
    dataSource = () => items;
    index = new Index(dataSource, {
      type: (item) => item.type,
      color: (item) => item.color,
    });
  });

  it("access(key) returns all items matching that key", () => {
    const fruits = index.access({ type: "fruit" }).values().toArray();
    expect(fruits.length).toBe(3);
    for (const it of items.filter((i) => i.type === "fruit")) {
      expect(fruits.includes(it)).toBe(true);
    }
    const greens = index.access({ color: "green" }).values().toArray();
    expect(greens.length).toBe(1);
    expect(greens.includes(items.find((i) => i.color === "green")!)).toBe(true);
  });

  it("access with multiple constraints returns the intersection", () => {
    // fruits AND red
    const redFruits = index
      .access({ type: "fruit", color: "red" })
      .values()
      .toArray();
    expect(redFruits.length).toBe(2);
    const expected = items.filter(
      (i) => i.type === "fruit" && i.color === "red",
    );
    for (const it of expected) {
      expect(redFruits.includes(it)).toBe(true);
    }
  });

  it("access returns empty set if any constraint has no matches", () => {
    // no blue vegetables
    const blueVeg = index
      .access({ type: "vegetable", color: "blue" })
      .values()
      .toArray();
    expect(blueVeg.length).toBe(0);
  });
});
