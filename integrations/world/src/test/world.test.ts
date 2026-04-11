import { describe, expect, it } from "vitest";
import { Position, Appearance, allComponents } from "../components";
import { MoveIntent, allEvents } from "../events";
import { createWorld } from "../world";

describe("@mp/world", () => {
  it("createWorld registers all components", () => {
    const world = createWorld();
    expect(world.componentTypes.length).toBe(allComponents.length);
    expect(world.componentTypes).toContain(Position);
    expect(world.componentTypes).toContain(Appearance);
  });

  it("createWorld registers all events", () => {
    const world = createWorld();
    expect(world.eventTypes.length).toBe(allEvents.length);
    expect(world.eventTypes).toContain(MoveIntent);
  });
});
