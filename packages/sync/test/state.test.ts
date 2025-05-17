import { expect, it } from "vitest";
import { createSyncStateMachine } from "../src/sync-state-machine";
import { applyPatch } from "../src/patch";

it("can access initial state", () => {
  const state = createSyncStateMachine({
    initialState: { record: { foo: "bar" } },
    clientVisibility: () => ({ record: new Set(["foo"] as const) }),
    clientIds: () => [],
  });

  expect(state.record()).toEqual({ foo: "bar" });
});

it("can add entity", () => {
  const state = createSyncStateMachine({
    initialState: { entity: { ["a" as string]: 0 } },
    clientVisibility: () => ({ entity: new Set([]) }),
    clientIds: () => [],
  });

  state.entity.set("b", 50);
  expect(state.entity()).toEqual({ a: 0, b: 50 });
});

it("can remove entity", () => {
  const state = createSyncStateMachine({
    initialState: { entity: { a: 0, b: 50 } },
    clientVisibility: () => ({ entity: new Set([]) }),
    clientIds: () => [],
  });

  state.entity.remove("b");
  expect(state.entity()).toEqual({ a: 0 });
});

it("can update entity", () => {
  const state = createSyncStateMachine({
    initialState: { entity: { a: 0, b: 50 } },
    clientVisibility: () => ({ entity: new Set([]) }),
    clientIds: () => [],
  });

  state.entity.set("b", 100);
  expect(state.entity()).toEqual({ a: 0, b: 100 });
});

it("can update entity partially", () => {
  const state = createSyncStateMachine({
    initialState: {
      entity: {
        john: { cash: 0, name: "john" },
        jane: { cash: 0, name: "jane" },
      },
    },
    clientVisibility: () => ({ entity: new Set([]) }),
    clientIds: () => [],
  });

  state.entity.update("john", (b) => b.add("cash", 50));
  expect(state.entity()).toEqual({
    john: { cash: 50, name: "john" },
    jane: { cash: 0, name: "jane" },
  });
});

it("can produce client state patches for object changes", () => {
  const john = { id: "john", cash: 0 };
  const jane = { id: "jane", cash: 0 };
  const actorList = [john, jane];
  const actorRecord = Object.fromEntries(actorList.map((a) => [a.id, a]));
  const initialState = { actors: actorRecord };

  const state = createSyncStateMachine({
    initialState,
    clientIds: () => actorList.map((a) => a.id),
    clientVisibility: (clientId) => ({ actors: new Set([clientId]) }),
  });

  state.actors.update(john.id, (b) => b.add("cash", 50));
  state.actors.update(jane.id, (b) => b.add("cash", 100));

  const { clientPatches } = state.$flush();

  const johnsClientState = {} as typeof initialState;
  const janesClientState = {} as typeof initialState;

  applyPatch(johnsClientState, clientPatches.get(john.id)!);
  expect(johnsClientState.actors).toEqual({
    [john.id]: { id: john.id, cash: 50 },
  });

  applyPatch(janesClientState, clientPatches.get(jane.id)!);
  expect(janesClientState.actors).toEqual({
    [jane.id]: { id: jane.id, cash: 100 },
  });
});

it("can produce client state patches for array properties", () => {
  const entity = { id: "0", list: [0] };
  const initialState = { entity: { [entity.id]: entity } };

  const state = createSyncStateMachine({
    initialState,
    clientIds: () => [entity.id],
    clientVisibility: (clientId) => ({ entity: new Set([clientId]) }),
  });

  state.entity.update(entity.id, (b) => b.add("list", [1, 2, 3]));

  const { clientPatches } = state.$flush();

  const clientState = {} as typeof initialState;

  applyPatch(clientState, clientPatches.get(entity.id)!);
  expect(clientState.entity).toEqual({
    [entity.id]: { ...entity, list: [1, 2, 3] },
  });
});

it("can produce client state patches for additions to record due to changes in visibility", () => {
  const john = { id: "john", visibleToOthers: false };
  const jane = { id: "jane", visibleToOthers: false };
  const actorList = [john, jane];
  const actorRecord = Object.fromEntries(actorList.map((a) => [a.id, a]));
  const initialState = { actors: actorRecord };

  const state = createSyncStateMachine({
    initialState,
    clientIds: () => actorList.map((a) => a.id),
    clientVisibility: (clientId, state) => ({
      actors: new Set(
        Object.values(state.actors)
          .filter((a) => a.id === clientId || a.visibleToOthers)
          .map((a) => a.id),
      ),
    }),
  });

  state.actors.update(john.id, (b) => b.add("visibleToOthers", true));
  state.actors.update(jane.id, (b) => b.add("visibleToOthers", true));

  const { clientPatches } = state.$flush();

  const johnsClientState = {} as typeof initialState;
  const janesClientState = {} as typeof initialState;

  applyPatch(johnsClientState, clientPatches.get(john.id)!);
  expect(johnsClientState.actors).toEqual({
    [john.id]: { id: john.id, visibleToOthers: true },
    [jane.id]: { id: jane.id, visibleToOthers: true },
  });

  applyPatch(janesClientState, clientPatches.get(jane.id)!);
  expect(janesClientState.actors).toEqual({
    [john.id]: { id: john.id, visibleToOthers: true },
    [jane.id]: { id: jane.id, visibleToOthers: true },
  });
});

it("can produce client state patches for removals in record due to changes in visibility", () => {
  const john = { id: "john", visibleToOthers: true };
  const jane = { id: "jane", visibleToOthers: true };
  const actorList = [john, jane];
  const actorRecord = Object.fromEntries(actorList.map((a) => [a.id, a]));

  const initialState = { actors: actorRecord };
  const state = createSyncStateMachine({
    initialState,
    clientIds: () => actorList.map((a) => a.id),
    clientVisibility: (clientId, state) => ({
      actors: new Set(
        Object.values(state.actors)
          .filter((a) => a.id === clientId || a.visibleToOthers)
          .map((a) => a.id),
      ),
    }),
  });

  state.actors.update(john.id, (b) => b.add("visibleToOthers", false));
  state.actors.update(jane.id, (b) => b.add("visibleToOthers", false));

  const { clientPatches } = state.$flush();

  const johnsClientState = {} as typeof initialState;
  const janesClientState = {} as typeof initialState;

  applyPatch(johnsClientState, clientPatches.get(john.id)!);
  expect(johnsClientState.actors).toEqual({
    [john.id]: { id: john.id, visibleToOthers: false },
  });

  applyPatch(janesClientState, clientPatches.get(jane.id)!);
  expect(janesClientState.actors).toEqual({
    [jane.id]: { id: jane.id, visibleToOthers: false },
  });
});

it("can produce client state patches for additions to record due to changes in state", () => {
  const john = { id: "john" };
  const initialState = { actors: { [john.id]: john } };
  const state = createSyncStateMachine({
    initialState,
    clientIds: () => [john.id],
    clientVisibility: (clientId, state) => ({
      actors: new Set(Object.keys(state.actors)),
    }),
  });

  const johnsClientState = {} as typeof initialState;
  const jane = { id: "jane" };

  state.actors.set(jane.id, jane);

  const { clientPatches } = state.$flush();

  applyPatch(johnsClientState, clientPatches.get(john.id)!);
  expect(johnsClientState.actors).toEqual({
    [john.id]: john,
    [jane.id]: jane,
  });
});

it("can produce client state patches for removals in record due to changes in state", () => {
  const john = { id: "john" };
  const jane = { id: "jane" };
  const initialState = { actors: { [john.id]: john, [jane.id]: jane } };
  const state = createSyncStateMachine({
    initialState,
    clientIds: () => [john.id],
    clientVisibility: (clientId, state) => ({
      actors: new Set(Object.keys(state.actors)),
    }),
  });

  const johnsClientState = {} as typeof initialState;

  state.actors.remove(jane.id);
  const { clientPatches } = state.$flush();

  applyPatch(johnsClientState, clientPatches.get(john.id)!);
  expect(johnsClientState.actors).toEqual({
    [john.id]: john,
  });
});

it("flush emits no events if no events have been added", () => {
  const state = createSyncStateMachine({
    initialState: {},
    clientIds: () => [],
    clientVisibility: () => ({}),
  });

  const { clientEvents } = state.$flush();
  expect(clientEvents.size).toBe(0);
});

it("flush can emit events", () => {
  type EventMap = { foo: string; bar: number };
  const clientId = "1";
  const state = createSyncStateMachine<{}, EventMap>({
    initialState: {},
    clientIds: () => [clientId],
    clientVisibility: () => ({}),
  });

  state.$event("foo", "hello world");
  state.$event("bar", 123);

  const { clientEvents } = state.$flush();

  expect(clientEvents).toEqual(
    new Map([
      [
        clientId,
        [
          ["foo", "hello world"],
          ["bar", 123],
        ],
      ],
    ]),
  );
});
