import { describe, expect, it } from "vitest";
import { Entity, string, struct, u32 } from "@rift/core";
import { EntityWatcher, PersistenceId, type PersistenceKey } from "../index";

const Stats = struct({
  power: u32(),
  speed: u32(),
});
const Name = string();

function makeEntity(): Entity {
  const entity = new Entity(1);
  entity.set(PersistenceId, "player-1" as PersistenceKey);
  entity.set(Stats, { power: 1, speed: 2 });
  entity.set(Name, "Ada");
  return entity;
}

describe("EntityWatcher", () => {
  it("marks struct field mutations as dirty", () => {
    const entity = makeEntity();
    const watcher = new EntityWatcher(entity, PersistenceId, [Stats, Name]);

    watcher.commit(watcher.diff().blobs);
    expect(watcher.isDirty()).toBe(false);

    entity.get(Stats).power = 10;

    expect(watcher.isDirty()).toBe(true);
    expect(watcher.diff().changed).toBe(true);
    watcher.dispose();
  });

  it("ignores byte-identical writes after commit", () => {
    const entity = makeEntity();
    const watcher = new EntityWatcher(entity, PersistenceId, [Stats, Name]);
    const initial = watcher.diff();
    watcher.commit(initial.blobs);

    entity.set(Name, "Ada");

    expect(watcher.isDirty()).toBe(false);
    expect(watcher.diff().changed).toBe(false);
    watcher.dispose();
  });

  it("detects component removal through snapshot comparison", () => {
    const entity = makeEntity();
    const watcher = new EntityWatcher(entity, PersistenceId, [Stats, Name]);
    watcher.commit(watcher.diff().blobs);

    entity.remove(Name);

    expect(watcher.diff().changed).toBe(true);
    watcher.dispose();
  });
});
