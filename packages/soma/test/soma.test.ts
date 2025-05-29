import { it, expect } from "vitest";
import { foo } from "../src";

it("can run a test", () => {
  expect(foo).toBe(123);
});
