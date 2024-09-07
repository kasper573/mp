import { it, expect, vi } from "vitest";
import { createDispatcher } from "../src/dispatcher";

it("it can call procedures", async () => {
  const handler = vi.fn();

  const d = createDispatcher(handler);

  await d.message();
  expect(handler).toBeCalled();
});

it("can call procedure with arbitrary number of arguments", async () => {
  const handler = vi.fn();

  const d = createDispatcher(handler);

  await d.message("foo", 123, false);
  expect(handler).toHaveBeenCalledWith("message", "foo", 123, false);
});
