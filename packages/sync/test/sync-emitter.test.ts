import { describe, beforeEach, it, expect } from "vitest";
import { PatchType } from "../src/patch";
import { SyncEmitter } from "../src/sync-emitter";

type TestState = {
  items: Record<string, number>;
};

type TestEventMap = {
  update: { id: string };
  notify: string;
};

const clientIds = ["client1", "client2"] as const;

describe("SyncEmitter", () => {
  let emitter: SyncEmitter<TestState, TestEventMap>;

  beforeEach(() => {
    emitter = new SyncEmitter<TestState, TestEventMap>({
      clientIds: () => clientIds,
      clientVisibility: (clientId, state) => {
        // client1 sees all items; client2 sees only even‐numbered ids
        const allIds = Object.keys(state.items);
        const visible =
          clientId === "client1"
            ? allIds
            : allIds.filter((k) => Number.parseInt(k, 10) % 2 === 0);
        return { items: new Set(visible) };
      },
    });
  });

  it("sends full‐state patch on initial flush and respects client visibility config", () => {
    const initialState = { items: { "1": 10, "2": 20, "3": 30 } };
    const { clientPatches } = emitter.flush(initialState);

    expect(clientPatches.size).toBe(2);

    // client1 sees all three
    expect(clientPatches.get("client1")).toEqual([
      [PatchType.Set, ["items"], { "1": 10, "2": 20, "3": 30 }],
    ]);

    // client2 sees only '2'
    expect(clientPatches.get("client2")).toEqual([
      [PatchType.Set, ["items"], { "2": 20 }],
    ]);
  });

  it("returns empty maps when flushed twice with no changes", () => {
    const state = { items: { "1": 1, "2": 2 } };
    emitter.flush(state);
    const { clientPatches, clientEvents } = emitter.flush(state);

    expect(clientPatches.size).toBe(0);
    expect(clientEvents.size).toBe(0);
  });

  it("includes patches added via addPatch, filtered by visibility", () => {
    const state = { items: { "1": 10, "2": 20, "3": 30 } };
    emitter.flush(state); // clear full‐state

    emitter.addPatch([
      [PatchType.Set, ["items", "2"], 25],
      [PatchType.Remove, ["items", "3"]],
    ]);
    const { clientPatches } = emitter.flush(state);

    // Both clients get the Set for '2'; only client1 sees '3' removal,
    // but since client2 never saw '3', Remove is filtered out.
    expect(clientPatches.get("client1")).toEqual(
      expect.arrayContaining([
        [PatchType.Set, ["items", "2"], 25],
        [PatchType.Remove, ["items", "3"]],
      ]),
    );
    expect(clientPatches.get("client1")!.length).toBe(2);

    expect(clientPatches.get("client2")).toEqual([
      [PatchType.Set, ["items", "2"], 25],
    ]);
  });

  it("delivers events according to visibility, and no‐visibility events to all", () => {
    const state = { items: { "1": 10, "2": 20, "3": 30 } };
    emitter.flush(state);

    emitter.addEvent("update", { id: "1" }); // broadcast
    emitter.addEvent("notify", "secret", { items: ["3"] }); // only clients seeing '3'

    const { clientEvents } = emitter.flush(state);

    // 'update' goes to both
    expect(clientEvents.get("client1")).toEqual(
      expect.arrayContaining([["update", { id: "1" }]]),
    );
    expect(clientEvents.get("client2")).toEqual(
      expect.arrayContaining([["update", { id: "1" }]]),
    );

    // 'notify' only to client1 (only it sees '3')
    expect(clientEvents.get("client1")).toEqual(
      expect.arrayContaining([["notify", "secret"]]),
    );
    expect(clientEvents.get("client2")).not.toEqual(
      expect.arrayContaining([["notify", "secret"]]),
    );
  });

  it("peekEvent returns all payloads for a given event name without consuming them", () => {
    emitter.addEvent("update", { id: "1" });
    emitter.addEvent("update", { id: "2" });
    emitter.addEvent("notify", "hi", { items: ["2"] });

    const updates1 = emitter.peekEvent("update");
    expect(updates1).toEqual([{ id: "1" }, { id: "2" }]);

    const notifies1 = emitter.peekEvent("notify");
    expect(notifies1).toEqual(["hi"]);

    // events should still be there until flush
    const state = { items: { "1": 10, "2": 20 } };
    emitter.flush(state);

    expect(emitter.peekEvent("update")).toEqual([]);
    expect(emitter.peekEvent("notify")).toEqual([]);
  });

  it("markToResendFullState forces a client to get full patch again", () => {
    const state = { items: { "1": 1, "2": 2 } };
    emitter.flush(state); // both marked given
    emitter.markToResendFullState("client1");

    const { clientPatches } = emitter.flush(state);
    expect(clientPatches.size).toBe(1);
    expect(clientPatches.get("client1")).toEqual([
      [PatchType.Set, ["items"], { "1": 1, "2": 2 }],
    ]);
  });

  it("fabricates 'remove' operations when entities leave visibility", () => {
    const state1 = { items: { "1": 10, "2": 20, "3": 30 } };
    const state2 = { items: { "1": 10, "3": 30 } }; // '2' gone

    emitter.flush(state1);
    const { clientPatches } = emitter.flush(state2);

    // Both clients previously saw '2'; now must get Remove for it
    for (const cid of clientIds) {
      expect(clientPatches.get(cid)).toEqual([
        [PatchType.Remove, ["items", "2"]],
      ]);
    }
  });

  it("fabricates 'set' operations when new entities enter visibility", () => {
    const state1 = { items: { "1": 10, "3": 30 } };
    const state2 = { items: { "1": 10, "3": 30, "4": 40 } }; // new '4'

    emitter.flush(state1);
    const { clientPatches } = emitter.flush(state2);

    // Both clients gain '4' in their visibility sets
    for (const cid of clientIds) {
      expect(clientPatches.get(cid)).toEqual([
        [PatchType.Set, ["items", "4"], 40],
      ]);
    }
  });
});
