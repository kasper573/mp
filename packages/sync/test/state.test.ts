import { expect, it, vi } from "vitest";
import type { Patch } from "immer";
import { SyncStateMachine } from "../state";
import type { ClientId } from "../shared";

it("can access initial state", () => {
  const state = new SyncStateMachine({
    state: () => ({ record: { foo: "bar" } }),
    clientReferences: () => ({ record: ["foo"] }),
    clientIds: () => [],
  });

  const spy = vi.fn();
  state.access(spy);
  expect(spy).toBeCalledWith({ record: { foo: "bar" } });
});

it("state access can return arbitrary value", () => {
  const state = new SyncStateMachine({
    state: () => ({}),
    clientReferences: () => ({}),
    clientIds: () => [],
  });

  const spy = vi.fn(() => "return");
  const [result] = state.access(spy);
  expect(result).toEqual("return");
});

it("can access client state", () => {
  const john = { id: "john" as ClientId };
  const jane = { id: "jane" as ClientId };
  const actorList = [john, jane];
  const actorRecord = Object.fromEntries(actorList.map((a) => [a.id, a]));

  const state = new SyncStateMachine({
    state: () => ({ actors: actorRecord }),
    clientIds: () => actorList.map((a) => a.id),
    clientReferences: (clientId) => ({ actors: [clientId] }),
  });

  expect(state.readClientState(john.id)).toEqual({
    actors: { [john.id]: john },
  });
  expect(state.readClientState(jane.id)).toEqual({
    actors: { [jane.id]: jane },
  });
});

it("can produce client state patches for object changes", () => {
  const john = { id: "john" as ClientId, cash: 0 };
  const jane = { id: "jane" as ClientId, cash: 0 };
  const actorList = [john, jane];
  const actorRecord = Object.fromEntries(actorList.map((a) => [a.id, a]));

  const state = new SyncStateMachine({
    state: () => ({ actors: actorRecord }),
    clientIds: () => actorList.map((a) => a.id),
    clientReferences: (clientId) => ({ actors: [clientId] }),
  });

  const [, patches] = state.access((draft) => {
    draft.actors[john.id].cash = 50;
    draft.actors[jane.id].cash = 100;
  });

  expect(patches[john.id]).toEqual([
    { path: ["actors", john.id, "cash"], op: "replace", value: 50 },
  ] satisfies Patch[]);

  expect(patches[jane.id]).toEqual([
    { path: ["actors", jane.id, "cash"], op: "replace", value: 100 },
  ] satisfies Patch[]);
});

it("can produce client state patches for additions to record", () => {
  const john = { id: "john" as ClientId, visibleToOthers: false };
  const jane = { id: "jane" as ClientId, visibleToOthers: false };
  const actorList = [john, jane];
  const actorRecord = Object.fromEntries(actorList.map((a) => [a.id, a]));

  const state = new SyncStateMachine({
    state: () => ({ actors: actorRecord }),
    clientIds: () => actorList.map((a) => a.id),
    clientReferences: (clientId, state) => ({
      actors: Object.values(state.actors)
        .filter((a) => a.id === clientId || a.visibleToOthers)
        .map((a) => a.id),
    }),
  });

  const [, patches] = state.access((draft) => {
    draft.actors[john.id].visibleToOthers = true;
    draft.actors[jane.id].visibleToOthers = true;
  });

  expect(patches[john.id]).toEqual([
    {
      path: ["actors", jane.id],
      op: "add",
      value: { ...jane, visible: true },
    },
  ] satisfies Patch[]);

  expect(patches[jane.id]).toEqual([
    {
      path: ["actors", john.id],
      op: "add",
      value: { ...john, visible: true },
    },
  ] satisfies Patch[]);
});

it("can produce client state patches for removals in record", () => {
  const john = { id: "john" as ClientId, visibleToOthers: true };
  const jane = { id: "jane" as ClientId, visibleToOthers: true };
  const actorList = [john, jane];
  const actorRecord = Object.fromEntries(actorList.map((a) => [a.id, a]));

  const state = new SyncStateMachine({
    state: () => ({ actors: actorRecord }),
    clientIds: () => actorList.map((a) => a.id),
    clientReferences: (clientId, state) => ({
      actors: Object.values(state.actors)
        .filter((a) => a.id === clientId || a.visibleToOthers)
        .map((a) => a.id),
    }),
  });

  const [, patches] = state.access((draft) => {
    draft.actors[john.id].visibleToOthers = false;
    draft.actors[jane.id].visibleToOthers = false;
  });

  expect(patches[john.id]).toEqual([
    { path: ["actors", jane.id], op: "remove" },
  ] satisfies Patch[]);

  expect(patches[jane.id]).toEqual([
    { path: ["actors", john.id], op: "remove" },
  ] satisfies Patch[]);
});
