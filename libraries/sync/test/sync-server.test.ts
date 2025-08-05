import type { SyncSchemaFor } from "@mp/sync2";
import { SyncSystem } from "@mp/sync2";
import { expect, it } from "vitest";
import { SyncServer } from "../src/sync-server";

// oxlint-disable-next-line consistent-type-definitions
type TestState = {
  items: {
    cash: number;
  };
};

// oxlint-disable-next-line consistent-type-definitions
type TestEventMap = {
  message: string;
};

const schema: SyncSchemaFor<TestState> = {
  items: {
    cash: null,
  },
};

it("sends full state patch on initial flush and respects client visibility config", () => {
  const server = new SyncServer<TestState, TestEventMap, string>({
    clientIds: () => ["client1", "client2"],
    clientVisibility: (id, state) => ({
      items: new Set(id === "client1" ? state.items.keys() : ["2"]),
    }),
  });

  const serverState = new SyncSystem(schema, {
    items: [
      ["1", { cash: 10 }],
      ["2", { cash: 20 }],
      ["3", { cash: 30 }],
    ],
  });
  const { clientPatches } = server.flush(serverState);

  const client1State = new SyncSystem(schema);
  const client2State = new SyncSystem(schema);

  client1State.update(clientPatches.get("client1") ?? []);
  client2State.update(clientPatches.get("client2") ?? []);

  expect(Array.from(client1State.entities.items.entries())).toEqual([
    ["1", { cash: 10 }],
    ["2", { cash: 20 }],
    ["3", { cash: 30 }],
  ]);
  expect(Array.from(client2State.entities.items.entries())).toEqual([
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

  const state = new SyncSystem(schema, {
    items: [
      ["1", { cash: 1 }],
      ["2", { cash: 2 }],
    ],
  });
  server.flush(state);
  const { clientPatches, clientEvents } = server.flush(state);

  expect(clientPatches.size).toBe(0);
  expect(clientEvents.size).toBe(0);
});

it("can collect patches", () => {
  interface Person {
    id: string;
    cash: number;
  }

  interface TestState {
    persons: Person;
  }

  const server = new SyncServer<TestState, {}, string>({
    clientIds: () => ["client"],
    clientVisibility: (id, state) => ({
      persons: new Set(state.persons.keys()),
    }),
  });

  const schema: SyncSchemaFor<TestState> = {
    persons: {
      id: null,
      cash: null,
    },
  };

  const serverState = new SyncSystem(schema);
  const john = serverState.entities.persons.create({ id: "john", cash: 0 });
  const jane = serverState.entities.persons.create({ id: "jane", cash: 50 });
  serverState.entities.persons.set("john", john);
  serverState.entities.persons.set("jane", jane);

  const clientState = new SyncSystem(schema);

  // Flush initial state
  const flush1 = server.flush(serverState);
  clientState.update(flush1.clientPatches.get("client") ?? []);

  // Mutating server state should trigger patch observers
  john.cash += 25;
  jane.cash -= 25;

  // Flush changes
  const flush2 = server.flush(serverState);
  clientState.update(flush2.clientPatches.get("client") ?? []);

  expect(clientState.entities.persons.get("john")?.cash).toBe(25);
  expect(clientState.entities.persons.get("jane")?.cash).toBe(25);
});

it("delivers events according to visibility", () => {
  const server = new SyncServer<TestState, TestEventMap, string>({
    clientIds: () => ["client1", "client2"],
    clientVisibility: (id, state) => ({
      items: new Set(id === "client1" ? state.items.keys() : ["2"]),
    }),
  });

  const state = new SyncSystem(schema, {
    items: [
      ["1", { cash: 10 }],
      ["2", { cash: 20 }],
      ["3", { cash: 30 }],
    ],
  });

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
  const serverState = new SyncSystem(schema, {
    items: [
      ["1", { cash: 1 }],
      ["2", { cash: 2 }],
    ],
  });
  server.flush(serverState); // Throw away initial flush output
  server.markToResendFullState("client1");
  const { clientPatches } = server.flush(serverState); // Flush again, but only for client1

  const client1State = new SyncSystem(schema);
  const client2State = new SyncSystem(schema);

  client1State.update(clientPatches.get("client1") ?? []);
  client2State.update(clientPatches.get("client2") ?? []);

  expect(Array.from(client1State.entities.items.entries())).toEqual(
    Array.from(serverState.entities.items.entries()),
  );
  expect(client2State.entities.items.size).toBe(0);
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
  const state1 = new SyncSystem(schema, {
    items: [
      ["1", { cash: 20 }],
      ["2", { cash: 30 }],
      ["3", { cash: 40 }],
    ],
  });
  const state2 = new SyncSystem(schema, {
    items: [
      ["1", { cash: 20 }],
      ["2", { cash: 5 }],
      ["3", { cash: 40 }],
    ],
  });

  const clientState = new SyncSystem(schema);

  const flush1 = server.flush(state1);
  clientState.update(flush1.clientPatches.get("client") ?? []);
  const flush2 = server.flush(state2);
  clientState.update(flush2.clientPatches.get("client") ?? []);

  expect(Array.from(clientState.entities.items.entries())).toEqual([
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
  const state1 = new SyncSystem(schema, {
    items: [
      ["1", { cash: 20 }],
      ["2", { cash: 5 }],
      ["3", { cash: 40 }],
    ],
  });
  const state2 = new SyncSystem(schema, {
    items: [
      ["1", { cash: 20 }],
      ["2", { cash: 30 }],
      ["3", { cash: 40 }],
    ],
  });

  const clientState = new SyncSystem(schema);

  const flush1 = server.flush(state1);
  clientState.update(flush1.clientPatches.get("client") ?? []);
  const flush2 = server.flush(state2);
  clientState.update(flush2.clientPatches.get("client") ?? []);

  expect(clientState.entities.items.size).toBe(3);
  expect(clientState.entities.items.get("1")).toEqual({ cash: 20 });
  expect(clientState.entities.items.get("2")).toEqual({ cash: 30 });
  expect(clientState.entities.items.get("3")).toEqual({ cash: 40 });
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

  const state = new SyncSystem(schema, {
    items: [
      ["1", { cash: 20 }],
      [secretEntityId, { cash: secretValue }],
      ["3", { cash: 40 }],
    ],
  });

  const { clientPatches } = server.flush(state);
  const serializedPatch = JSON.stringify(clientPatches.get("client"));
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

  const state = new SyncSystem(schema, {
    items: [
      ["1", { cash: 20 }],
      ["3", { cash: 40 }],
    ],
  });

  server.flush(state); //  Omit initial flush

  // Create secret update
  const secret = state.entities.items.create({ cash: 20 });
  state.entities.items.set(secretEntityId, secret);
  secret.cash = secretValue;

  const { clientPatches } = server.flush(state);
  const serializedPatch = JSON.stringify(clientPatches.get("client"));
  expect(serializedPatch).not.toContain(secretValue);
  expect(serializedPatch).not.toContain(secretEntityId);
});
