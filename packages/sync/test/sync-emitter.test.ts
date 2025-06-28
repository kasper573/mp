import { it, expect } from "vitest";
import { applyPatch } from "../src/patch";
import { SyncEmitter } from "../src/sync-emitter";
import { SyncMap } from "../src/sync-map";
import { collect } from "../src/patch-collector";

type TestState = {
  items: SyncMap<string, number>;
};

type TestEventMap = {
  message: string;
};

it("sends full state patch on initial flush and respects client visibility config", () => {
  const emitter = new SyncEmitter<TestState, TestEventMap>({
    clientIds: () => ["client1", "client2"],
    clientVisibility: (id, state) => ({
      items: new Set(id === "client1" ? state.items.keys() : ["2"]),
    }),
  });

  const initialState: TestState = {
    items: new SyncMap([
      ["1", 10],
      ["2", 20],
      ["3", 30],
    ]),
  };
  const { clientPatches } = emitter.flush(initialState);

  const client1State: TestState = { items: new SyncMap() };
  const client2State: TestState = { items: new SyncMap() };

  applyPatch(client1State, clientPatches.get("client1")!);
  applyPatch(client2State, clientPatches.get("client2")!);

  expect(client1State).toEqual({
    items: new SyncMap([
      ["1", 10],
      ["2", 20],
      ["3", 30],
    ]),
  });
  expect(client2State).toEqual({
    items: new SyncMap([["2", 20]]),
  });
});

it("returns no patches or events when flushed twice with no changes", () => {
  const emitter = new SyncEmitter<TestState, TestEventMap>({
    clientIds: () => ["client"],
    clientVisibility: (id, state) => ({
      items: new Set(state.items.keys()),
    }),
  });

  const state: TestState = {
    items: new SyncMap([
      ["1", 1],
      ["2", 2],
    ]),
  };
  emitter.flush(state);
  const { clientPatches, clientEvents } = emitter.flush(state);

  expect(clientPatches.size).toBe(0);
  expect(clientEvents.size).toBe(0);
});

it("can collect patches", () => {
  class Person {
    @collect()
    accessor id: string = "";

    @collect()
    accessor cash: number = 0;

    constructor(id: string, cash: number) {
      this.id = id;
      this.cash = cash;
    }
  }

  type TestState = {
    persons: SyncMap<Person["id"], Person>;
  };

  const emitter = new SyncEmitter<TestState, {}>({
    clientIds: () => ["client"],
    clientVisibility: (id, state) => ({
      persons: new Set(state.persons.keys()),
    }),
  });

  const john = new Person("john", 0);
  const jane = new Person("jane", 50);
  const serverState = {
    persons: new SyncMap([
      [john.id, john],
      [jane.id, jane],
    ]),
  };

  emitter.attachPatchCollectors(serverState);

  const clientState: TestState = { persons: new SyncMap() };

  // Flush initial state
  const flush1 = emitter.flush(serverState);
  applyPatch(clientState, flush1.clientPatches.get("client") ?? []);

  // Mutating server state should trigger patch observers
  john.cash += 25;
  jane.cash -= 25;

  // Flush changes
  const flush2 = emitter.flush(serverState);
  applyPatch(clientState, flush2.clientPatches.get("client") ?? []);

  expect(clientState.persons.get("john")?.cash).toBe(25);
  expect(clientState.persons.get("jane")?.cash).toBe(25);
});

it("delivers events according to visibility", () => {
  const emitter = new SyncEmitter<TestState, TestEventMap>({
    clientIds: () => ["client1", "client2"],
    clientVisibility: (id, state) => ({
      items: new Set(id === "client1" ? state.items.keys() : ["2"]),
    }),
  });

  const state: TestState = {
    items: new SyncMap([
      ["1", 10],
      ["2", 20],
      ["3", 30],
    ]),
  };

  emitter.addEvent("message", "broadcast");
  emitter.addEvent("message", "direct", { items: ["3"] });
  const { clientEvents } = emitter.flush(state);

  // 'broadcast' goes to both
  expect(clientEvents.get("client1")).toEqual(
    expect.arrayContaining([["message", "broadcast"]]),
  );
  expect(clientEvents.get("client2")).toEqual(
    expect.arrayContaining([["message", "broadcast"]]),
  );

  // 'direct' only to client1
  expect(clientEvents.get("client1")).toEqual(
    expect.arrayContaining([["message", "direct"]]),
  );
  expect(clientEvents.get("client2")).not.toEqual(
    expect.arrayContaining([["message", "direct"]]),
  );
});

it("can access events by name before flushing", () => {
  const emitter = new SyncEmitter<TestState, TestEventMap>({
    clientIds: () => ["client"],
    clientVisibility: (id, state) => ({
      items: new Set(state.items.keys()),
    }),
  });
  emitter.addEvent("message", "broadcast");
  emitter.addEvent("message", "direct", { items: ["2"] });

  const updates1 = emitter.peekEvent("message");
  expect(updates1).toEqual(["broadcast", "direct"]);
});

it("markToResendFullState forces a client to get full patch again", () => {
  const emitter = new SyncEmitter<TestState, TestEventMap>({
    clientIds: () => ["client1", "client2"],
    clientVisibility: (id, state) => ({
      items: new Set(id === "client1" ? state.items.keys() : ["2"]),
    }),
  });
  const serverState: TestState = {
    items: new SyncMap([
      ["1", 1],
      ["2", 2],
    ]),
  };
  emitter.flush(serverState); // Throw away initial flush output
  emitter.markToResendFullState("client1");
  const { clientPatches } = emitter.flush(serverState); // Flush again, but only for client1

  const client1State: TestState = { items: new SyncMap() };
  const client2State: TestState = { items: new SyncMap() };

  applyPatch(client1State, clientPatches.get("client1") ?? []);
  applyPatch(client2State, clientPatches.get("client2") ?? []);

  expect(client1State).toEqual(serverState);
  expect(client2State.items.size).toBe(0);
});

it("fabricates 'remove' operations when entities leave visibility", () => {
  const emitter = new SyncEmitter<TestState, TestEventMap>({
    clientIds: () => ["client"],
    clientVisibility: (id, state) => ({
      items: new Set(
        state.items
          .entries()
          .filter(([, value]) => value > 10)
          .map(([key]) => key),
      ),
    }),
  });
  const state1: TestState = {
    items: new SyncMap([
      ["1", 20],
      ["2", 30],
      ["3", 40],
    ]),
  };
  const state2: TestState = {
    items: new SyncMap([
      ["1", 20],
      ["2", 5],
      ["3", 40],
    ]),
  };

  const clientState: TestState = { items: new SyncMap() };

  const flush1 = emitter.flush(state1);
  applyPatch(clientState, flush1.clientPatches.get("client")!);
  const flush2 = emitter.flush(state2);
  applyPatch(clientState, flush2.clientPatches.get("client")!);

  expect(clientState).toEqual({
    items: new SyncMap([
      ["1", 20],
      // '2' no longer visible since it's less than 10
      ["3", 40],
    ]),
  });
});

it("fabricates 'set' operations when new entities enter visibility", () => {
  const emitter = new SyncEmitter<TestState, TestEventMap>({
    clientIds: () => ["client"],
    clientVisibility: (id, state) => ({
      items: new Set(
        state.items
          .entries()
          .filter(([, value]) => value > 10)
          .map(([key]) => key),
      ),
    }),
  });
  const state1: TestState = {
    items: new SyncMap([
      ["1", 20],
      ["2", 5],
      ["3", 40],
    ]),
  };
  const state2: TestState = {
    items: new SyncMap([
      ["1", 20],
      ["2", 30],
      ["3", 40],
    ]),
  };

  const clientState: TestState = { items: new SyncMap() };

  const flush1 = emitter.flush(state1);
  applyPatch(clientState, flush1.clientPatches.get("client")!);
  const flush2 = emitter.flush(state2);
  applyPatch(clientState, flush2.clientPatches.get("client")!);

  expect(clientState).toEqual({
    items: new SyncMap([
      ["1", 20],
      ["2", 30],
      ["3", 40],
    ]),
  });
});
