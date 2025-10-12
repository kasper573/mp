// oxlint-disable consistent-type-definitions
import { expect, it } from "vitest";
import { object, prop } from "../src";
import { SyncMap } from "../src/sync-map";
import { SyncServer } from "../src/sync-server";
import { updateState } from "../src/sync-state";

type TestState = {
  items: SyncMap<string, Item>;
};

function createTestState(
  entries?: Iterable<readonly [string, Item]>,
): TestState {
  return {
    items: new SyncMap<string, Item>(entries),
  };
}

const Item = object({
  cash: prop<number>(),
});
type Item = typeof Item.$infer;

// oxlint-disable-next-line consistent-type-definitions
type TestEventMap = {
  message: string;
};

it("sends full state patch on initial flush and respects client visibility config", () => {
  const server = new SyncServer<TestState, TestEventMap, string>({
    clientIds: () => ["client1", "client2"],
    clientVisibility: (id, state) => ({
      items: new Set(id === "client1" ? state.items.keys() : ["2"]),
    }),
  });

  const serverState = createTestState([
    ["1", Item.create({ cash: 10 })],
    ["2", Item.create({ cash: 20 })],
    ["3", Item.create({ cash: 30 })],
  ]);
  const { clientPatches } = server.flush(serverState);

  const client1State = createTestState();
  const client2State = createTestState();

  updateState(client1State, clientPatches.get("client1") ?? []);
  updateState(client2State, clientPatches.get("client2") ?? []);

  expect(Array.from(client1State.items.entries())).toMatchObject([
    ["1", { cash: 10 }],
    ["2", { cash: 20 }],
    ["3", { cash: 30 }],
  ]);
  expect(Array.from(client2State.items.entries())).toMatchObject([
    ["2", { cash: 20 }],
  ]);
});

it("returns no patches or events when flushed twice with no changes", () => {
  const server = new SyncServer<TestState, TestEventMap, string>({
    clientIds: () => ["client"],
    clientVisibility: (id, state) => ({
      items: new Set(state.items.keys()),
    }),
  });

  const state = createTestState([
    ["1", Item.create({ cash: 1 })],
    ["2", Item.create({ cash: 2 })],
  ]);
  server.flush(state);
  const { clientPatches, clientEvents } = server.flush(state);

  expect(clientPatches.size).toBe(0);
  expect(clientEvents.size).toBe(0);
});

it("can collect patches", () => {
  const Person = object({
    id: prop<string>(),
    cash: prop<number>(),
  });
  type Person = typeof Person.$infer;

  type TestState = {
    persons: SyncMap<string, Person>;
  };

  function createTestState(
    entries?: Iterable<readonly [string, Person]>,
  ): TestState {
    return {
      persons: new SyncMap(entries),
    };
  }

  const server = new SyncServer<TestState, {}, string>({
    clientIds: () => ["client"],
    clientVisibility: (id, state) => ({
      persons: new Set(state.persons.keys()),
    }),
  });

  const serverState = createTestState();
  const john = Person.create({ id: "john", cash: 0 });
  const jane = Person.create({ id: "jane", cash: 50 });
  serverState.persons.set("john", john);
  serverState.persons.set("jane", jane);

  const clientState = createTestState();

  // Flush initial state
  const flush1 = server.flush(serverState);
  updateState(clientState, flush1.clientPatches.get("client") ?? []);

  // Mutating server state should trigger patch observers
  john.cash += 25;
  jane.cash -= 25;

  // Flush changes
  const flush2 = server.flush(serverState);
  updateState(clientState, flush2.clientPatches.get("client") ?? []);

  expect(clientState.persons.get("john")?.cash).toBe(25);
  expect(clientState.persons.get("jane")?.cash).toBe(25);
});

it("delivers events according to visibility", () => {
  const server = new SyncServer<TestState, TestEventMap, string>({
    clientIds: () => ["client1", "client2"],
    clientVisibility: (id, state) => ({
      items: new Set(id === "client1" ? state.items.keys() : ["2"]),
    }),
  });

  const state = createTestState([
    ["1", Item.create({ cash: 10 })],
    ["2", Item.create({ cash: 20 })],
    ["3", Item.create({ cash: 30 })],
  ]);

  server.addEvent("message", "broadcast");
  server.addEvent("message", "direct", { items: ["3"] });
  const { clientEvents } = server.flush(state);

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
  const server = new SyncServer<TestState, TestEventMap, string>({
    clientIds: () => ["client"],
    clientVisibility: (id, state) => ({
      items: new Set(state.items.keys()),
    }),
  });
  server.addEvent("message", "broadcast");
  server.addEvent("message", "direct", { items: ["2"] });

  const updates1 = server.peekEvent("message");
  expect(updates1).toEqual(["broadcast", "direct"]);
});

it("markToResendFullState forces a client to get full patch again", () => {
  const server = new SyncServer<TestState, TestEventMap, string>({
    clientIds: () => ["client1", "client2"],
    clientVisibility: (id, state) => ({
      items: new Set(id === "client1" ? state.items.keys() : ["2"]),
    }),
  });
  const serverState = createTestState([
    ["1", Item.create({ cash: 1 })],
    ["2", Item.create({ cash: 2 })],
  ]);
  server.flush(serverState); // Throw away initial flush output
  server.markToResendFullState("client1");
  const { clientPatches } = server.flush(serverState); // Flush again, but only for client1

  const client1State = createTestState();
  const client2State = createTestState();

  updateState(client1State, clientPatches.get("client1") ?? []);
  updateState(client2State, clientPatches.get("client2") ?? []);

  expect(Array.from(client1State.items.entries())).toEqual(
    Array.from(serverState.items.entries()),
  );
  expect(client2State.items.size).toBe(0);
});

it("fabricates 'remove' operations when entities leave visibility", () => {
  const server = new SyncServer<TestState, TestEventMap, string>({
    clientIds: () => ["client"],
    clientVisibility: (id, state) => ({
      items: new Set(
        state.items
          .entries()
          .filter(([, item]) => item.cash > 10)
          .map(([key]) => key),
      ),
    }),
  });
  const state1 = createTestState([
    ["1", Item.create({ cash: 20 })],
    ["2", Item.create({ cash: 30 })],
    ["3", Item.create({ cash: 40 })],
  ]);
  const state2 = createTestState([
    ["1", Item.create({ cash: 20 })],
    ["2", Item.create({ cash: 5 })],
    ["3", Item.create({ cash: 40 })],
  ]);

  const clientState = createTestState();

  const flush1 = server.flush(state1);
  updateState(clientState, flush1.clientPatches.get("client") ?? []);
  const flush2 = server.flush(state2);
  updateState(clientState, flush2.clientPatches.get("client") ?? []);

  expect(Array.from(clientState.items.entries())).toMatchObject([
    ["1", { cash: 20 }],
    // '2' no longer visible since it's less than 10
    ["3", { cash: 40 }],
  ]);
});

it("fabricates 'set' operations when new entities enter visibility", () => {
  const server = new SyncServer<TestState, TestEventMap, string>({
    clientIds: () => ["client"],
    clientVisibility: (id, state) => ({
      items: new Set(
        state.items
          .entries()
          .filter(([, item]) => item.cash > 10)
          .map(([key]) => key),
      ),
    }),
  });
  const state1 = createTestState([
    ["1", Item.create({ cash: 20 })],
    ["2", Item.create({ cash: 5 })],
    ["3", Item.create({ cash: 40 })],
  ]);
  const state2 = createTestState([
    ["1", Item.create({ cash: 20 })],
    ["2", Item.create({ cash: 30 })],
    ["3", Item.create({ cash: 40 })],
  ]);

  const clientState = createTestState();

  const flush1 = server.flush(state1);
  updateState(clientState, flush1.clientPatches.get("client") ?? []);
  const flush2 = server.flush(state2);
  updateState(clientState, flush2.clientPatches.get("client") ?? []);

  expect(clientState.items.size).toBe(3);
  expect(clientState.items.get("1")).toMatchObject({ cash: 20 });
  expect(clientState.items.get("2")).toMatchObject({ cash: 30 });
  expect(clientState.items.get("3")).toMatchObject({ cash: 40 });
});

it("does not expose invisible data on initial state flush", () => {
  const secretValue = 1337;
  const secretEntityId = "secret-entity-id";
  const server = new SyncServer<TestState, TestEventMap, string>({
    clientIds: () => ["client"],
    clientVisibility: (id, state) => ({
      items: new Set(
        state.items
          .entries()
          .filter(([, item]) => item.cash !== secretValue)
          .map(([key]) => key),
      ),
    }),
  });

  const state = createTestState([
    ["1", Item.create({ cash: 20 })],
    [secretEntityId, { cash: secretValue }],
    ["3", Item.create({ cash: 40 })],
  ]);

  const { clientPatches } = server.flush(state);
  const serializedPatch = JSON.stringify(clientPatches.get("client")) ?? "";
  expect(serializedPatch).not.toContain(secretValue);
  expect(serializedPatch).not.toContain(secretEntityId);
});

it("does not expose invisible data on update flush", () => {
  const secretValue = 1337;
  const secretEntityId = "secret-entity-id";
  const server = new SyncServer<TestState, TestEventMap, string>({
    clientIds: () => ["client"],
    clientVisibility: (id, state) => ({
      items: new Set(
        state.items
          .entries()
          .filter(([, item]) => item.cash !== secretValue)
          .map(([key]) => key),
      ),
    }),
  });

  const state = createTestState([
    ["1", Item.create({ cash: 20 })],
    ["3", Item.create({ cash: 40 })],
  ]);

  server.flush(state); //  Omit initial flush

  // Create secret update
  const secret = Item.create({ cash: 20 });
  state.items.set(secretEntityId, secret);
  secret.cash = secretValue;

  const { clientPatches } = server.flush(state);
  const serializedPatch = JSON.stringify(clientPatches.get("client")) ?? "";
  expect(serializedPatch).not.toContain(secretValue);
  expect(serializedPatch).not.toContain(secretEntityId);
});
