import { expect, it } from "vitest";
import { applyPatches } from "immer";
import { SyncStateMachine } from "../state";
import type { ClientId } from "../shared";

it("can access initial state", () => {
  const state = new SyncStateMachine({
    state: () => ({ record: { foo: "bar" } }),
    clientVisibility: () => ({ record: new Set(["foo"] as const) }),
    clientIds: () => [],
  });

  state.access((draft) => {
    expect(draft).toEqual({ record: { foo: "bar" } });
  });
});

it("state access can return arbitrary value", () => {
  const state = new SyncStateMachine({
    state: () => ({}),
    clientVisibility: () => ({}),
    clientIds: () => [],
  });

  const [result] = state.access(() => "return");
  expect(result).toEqual("return");
});

it("can mutate state", () => {
  const state = new SyncStateMachine({
    state: () => ({ entity: { count: 0 } }),
    clientVisibility: () => ({ entity: new Set([]) }),
    clientIds: () => [],
  });

  state.access((draft) => (draft.entity.count = 50));
  const [count] = state.access((draft) => draft.entity.count);
  expect(count).toEqual(50);
});

it("can access client state", () => {
  const john = { id: "john" as ClientId };
  const jane = { id: "jane" as ClientId };
  const actorList = [john, jane];
  const actorRecord = Object.fromEntries(actorList.map((a) => [a.id, a]));

  const state = new SyncStateMachine({
    state: () => ({ actors: actorRecord }),
    clientIds: () => actorList.map((a) => a.id),
    clientVisibility: (clientId) => ({ actors: new Set([clientId]) }),
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
    clientVisibility: (clientId) => ({ actors: new Set([clientId]) }),
  });

  const johnsClientState = state.readClientState(john.id);
  const janesClientState = state.readClientState(jane.id);

  const [, patches] = state.access((draft) => {
    draft.actors[john.id].cash = 50;
    draft.actors[jane.id].cash = 100;
    return;
  });

  const johnsNewClientState = applyPatches(johnsClientState, patches[john.id]);
  expect(johnsNewClientState.actors).toEqual({
    [john.id]: { id: john.id, cash: 50 },
  });

  const janesNewClientState = applyPatches(janesClientState, patches[jane.id]);
  expect(janesNewClientState.actors).toEqual({
    [jane.id]: { id: jane.id, cash: 100 },
  });
});

it("can produce client state patches for additions to record", () => {
  const john = { id: "john" as ClientId, visibleToOthers: false };
  const jane = { id: "jane" as ClientId, visibleToOthers: false };
  const actorList = [john, jane];
  const actorRecord = Object.fromEntries(actorList.map((a) => [a.id, a]));

  const state = new SyncStateMachine({
    state: () => ({ actors: actorRecord }),
    clientIds: () => actorList.map((a) => a.id),
    clientVisibility: (clientId, state) => ({
      actors: new Set(
        Object.values(state.actors)
          .filter((a) => a.id === clientId || a.visibleToOthers)
          .map((a) => a.id),
      ),
    }),
  });

  const johnsClientState = state.readClientState(john.id);
  const janesClientState = state.readClientState(jane.id);

  const [, patches] = state.access((draft) => {
    draft.actors[john.id].visibleToOthers = true;
    draft.actors[jane.id].visibleToOthers = true;
  });

  const johnsNewClientState = applyPatches(johnsClientState, patches[john.id]);
  expect(johnsNewClientState.actors).toEqual({
    [john.id]: { id: john.id, visibleToOthers: true },
    [jane.id]: { id: jane.id, visibleToOthers: true },
  });

  const janesNewClientState = applyPatches(janesClientState, patches[jane.id]);
  expect(janesNewClientState.actors).toEqual({
    [john.id]: { id: john.id, visibleToOthers: true },
    [jane.id]: { id: jane.id, visibleToOthers: true },
  });
});

it("can produce client state patches for removals in record", () => {
  const john = { id: "john" as ClientId, visibleToOthers: true };
  const jane = { id: "jane" as ClientId, visibleToOthers: true };
  const actorList = [john, jane];
  const actorRecord = Object.fromEntries(actorList.map((a) => [a.id, a]));

  const state = new SyncStateMachine({
    state: () => ({ actors: actorRecord }),
    clientIds: () => actorList.map((a) => a.id),
    clientVisibility: (clientId, state) => ({
      actors: new Set(
        Object.values(state.actors)
          .filter((a) => a.id === clientId || a.visibleToOthers)
          .map((a) => a.id),
      ),
    }),
  });

  const johnsClientState = state.readClientState(john.id);
  const janesClientState = state.readClientState(jane.id);

  const [, patches] = state.access((draft) => {
    draft.actors[john.id].visibleToOthers = false;
    draft.actors[jane.id].visibleToOthers = false;
  });

  const johnsNewClientState = applyPatches(johnsClientState, patches[john.id]);
  expect(johnsNewClientState.actors).toEqual({
    [john.id]: { id: john.id, visibleToOthers: false },
  });

  const janesNewClientState = applyPatches(janesClientState, patches[jane.id]);
  expect(janesNewClientState.actors).toEqual({
    [jane.id]: { id: jane.id, visibleToOthers: false },
  });
});
