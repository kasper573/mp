import { expect, it } from "vitest";
import { createPatchStateMachine } from "../PatchStateMachine";
import type { ClientId } from "../shared";
import { applyPatch } from "../patch";

it("can access initial state", () => {
  const state = createPatchStateMachine({
    initialState: { record: { foo: "bar" } },
    clientVisibility: () => ({ record: new Set(["foo"] as const) }),
    clientIds: () => [],
  });

  expect(state.record()).toEqual({ foo: "bar" });
});

it("can add entity", () => {
  const state = createPatchStateMachine({
    initialState: { entity: { ["a" as string]: 0 } },
    clientVisibility: () => ({ entity: new Set([]) }),
    clientIds: () => [],
  });

  state.entity.set("b", 50);
  expect(state.entity()).toEqual({ a: 0, b: 50 });
});

it("can remove entity", () => {
  const state = createPatchStateMachine({
    initialState: { entity: { a: 0, b: 50 } },
    clientVisibility: () => ({ entity: new Set([]) }),
    clientIds: () => [],
  });

  state.entity.remove("b");
  expect(state.entity()).toEqual({ a: 0 });
});

it("can update entity", () => {
  const state = createPatchStateMachine({
    initialState: { entity: { a: 0, b: 50 } },
    clientVisibility: () => ({ entity: new Set([]) }),
    clientIds: () => [],
  });

  state.entity.set("b", 100);
  expect(state.entity()).toEqual({ a: 0, b: 100 });
});

it("can update entity partially", () => {
  const state = createPatchStateMachine({
    initialState: {
      entity: {
        john: { cash: 0, name: "john" },
        jane: { cash: 0, name: "jane" },
      },
    },
    clientVisibility: () => ({ entity: new Set([]) }),
    clientIds: () => [],
  });

  state.entity.update("john", { cash: 50 });
  expect(state.entity()).toEqual({
    john: { cash: 50, name: "john" },
    jane: { cash: 0, name: "jane" },
  });
});

it("can produce client state patches for object changes", () => {
  const john = { id: "john" as ClientId, cash: 0 };
  const jane = { id: "jane" as ClientId, cash: 0 };
  const actorList = [john, jane];
  const actorRecord = Object.fromEntries(actorList.map((a) => [a.id, a]));
  const initialState = { actors: actorRecord };

  const state = createPatchStateMachine({
    initialState,
    clientIds: () => actorList.map((a) => a.id),
    clientVisibility: (clientId) => ({ actors: new Set([clientId]) }),
  });

  state.actors.update(john.id, { cash: 50 });
  state.actors.update(jane.id, { cash: 100 });

  const patches = state.flush();

  const johnsClientState = {} as typeof initialState;
  const janesClientState = {} as typeof initialState;

  applyPatch(johnsClientState, patches.get(john.id)!);
  expect(johnsClientState.actors).toEqual({
    [john.id]: { id: john.id, cash: 50 },
  });

  applyPatch(janesClientState, patches.get(jane.id)!);
  expect(janesClientState.actors).toEqual({
    [jane.id]: { id: jane.id, cash: 100 },
  });
});

it("can produce client state patches for array properties", () => {
  const entity = { id: "0" as ClientId, list: [0] };
  const initialState = { entity: { [entity.id]: entity } };

  const state = createPatchStateMachine({
    initialState,
    clientIds: () => [entity.id],
    clientVisibility: (clientId) => ({ entity: new Set([clientId]) }),
  });

  state.entity.update(entity.id, { list: [1, 2, 3] });

  const patches = state.flush();

  const clientState = {} as typeof initialState;

  applyPatch(clientState, patches.get(entity.id)!);
  expect(clientState.entity).toEqual({
    [entity.id]: { ...entity, list: [1, 2, 3] },
  });
});

it("can produce client state patches for additions to record due to changes in visibility", () => {
  const john = { id: "john" as ClientId, visibleToOthers: false };
  const jane = { id: "jane" as ClientId, visibleToOthers: false };
  const actorList = [john, jane];
  const actorRecord = Object.fromEntries(actorList.map((a) => [a.id, a]));
  const initialState = { actors: actorRecord };

  const state = createPatchStateMachine({
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

  state.actors.update(john.id, { visibleToOthers: true });
  state.actors.update(jane.id, { visibleToOthers: true });

  const patches = state.flush();

  const johnsClientState = {} as typeof initialState;
  const janesClientState = {} as typeof initialState;

  applyPatch(johnsClientState, patches.get(john.id)!);
  expect(johnsClientState.actors).toEqual({
    [john.id]: { id: john.id, visibleToOthers: true },
    [jane.id]: { id: jane.id, visibleToOthers: true },
  });

  applyPatch(janesClientState, patches.get(jane.id)!);
  expect(janesClientState.actors).toEqual({
    [john.id]: { id: john.id, visibleToOthers: true },
    [jane.id]: { id: jane.id, visibleToOthers: true },
  });
});

it("can produce client state patches for removals in record due to changes in visibility", () => {
  const john = { id: "john" as ClientId, visibleToOthers: true };
  const jane = { id: "jane" as ClientId, visibleToOthers: true };
  const actorList = [john, jane];
  const actorRecord = Object.fromEntries(actorList.map((a) => [a.id, a]));

  const initialState = { actors: actorRecord };
  const state = createPatchStateMachine({
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

  state.actors.update(john.id, { visibleToOthers: false });
  state.actors.update(jane.id, { visibleToOthers: false });

  const patches = state.flush();

  const johnsClientState = {} as typeof initialState;
  const janesClientState = {} as typeof initialState;

  applyPatch(johnsClientState, patches.get(john.id)!);
  expect(johnsClientState.actors).toEqual({
    [john.id]: { id: john.id, visibleToOthers: false },
  });

  applyPatch(janesClientState, patches.get(jane.id)!);
  expect(janesClientState.actors).toEqual({
    [jane.id]: { id: jane.id, visibleToOthers: false },
  });
});

it("can produce client state patches for additions to record due to changes in state", () => {
  const john = { id: "john" as ClientId };
  const initialState = { actors: { [john.id]: john } };
  const state = createPatchStateMachine({
    initialState,
    clientIds: () => [john.id],
    clientVisibility: (_, state) => ({
      actors: new Set(Object.keys(state.actors)),
    }),
  });

  const johnsClientState = {} as typeof initialState;
  const jane = { id: "jane" as ClientId };

  state.actors.set(jane.id, jane);

  const patches = state.flush();

  applyPatch(johnsClientState, patches.get(john.id)!);
  expect(johnsClientState.actors).toEqual({
    [john.id]: john,
    [jane.id]: jane,
  });
});

it("can produce client state patches for removals in record due to changes in state", () => {
  const john = { id: "john" as ClientId };
  const jane = { id: "jane" as ClientId };
  const initialState = { actors: { [john.id]: john, [jane.id]: jane } };
  const state = createPatchStateMachine({
    initialState,
    clientIds: () => [john.id],
    clientVisibility: (_, state) => ({
      actors: new Set(Object.keys(state.actors)),
    }),
  });

  const johnsClientState = {} as typeof initialState;

  state.actors.remove(jane.id);
  const patches = state.flush();

  applyPatch(johnsClientState, patches.get(john.id)!);
  expect(johnsClientState.actors).toEqual({
    [john.id]: john,
  });
});
