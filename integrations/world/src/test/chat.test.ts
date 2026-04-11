import { RiftServer, type Infer } from "@rift/core";
import { describe, expect, it } from "vitest";
import { AreaMember, ClientSession } from "../components";
import type { AreaId } from "../domain-ids";
import { ChatMessage } from "../events";
import { AreaModule } from "../modules/area/module";
import { ChatModule } from "../modules/chat/module";
import type { ChatApi } from "../modules/chat/module";
import { createWorld } from "../world";

interface EmitCapture {
  data: Infer<typeof ChatMessage>;
  recipients: string[] | "all";
}

function makeHarness(): {
  api: ChatApi;
  rift: RiftServer;
  captured: EmitCapture[];
} {
  const rift = new RiftServer(createWorld());
  const captured: EmitCapture[] = [];
  const originalEmit = rift.emit.bind(rift);
  rift.emit = ((type: unknown, value: unknown) => {
    if (type === ChatMessage) {
      return {
        toAll: () =>
          captured.push({
            data: value as Infer<typeof ChatMessage>,
            recipients: "all",
          }),
        to: (...ids: string[]) =>
          captured.push({
            data: value as Infer<typeof ChatMessage>,
            recipients: ids,
          }),
        toObserversOf: () => {},
      } as never;
    }
    return originalEmit(type as never, value as never);
  }) as typeof rift.emit;

  const stubCtx = {
    rift,
    wss: { on: () => {} },
    values: {},
    addClient: () => {},
    removeClient: () => {},
    using: () => ({}) as never,
    onTick: () => {},
  };

  const areaResult = AreaModule.server!(stubCtx);
  const areaApi = (areaResult as { api: unknown }).api;

  const chatResult = ChatModule.server!({
    ...stubCtx,
    using: ((m: unknown) =>
      m === AreaModule ? areaApi : ({} as never)) as never,
  });
  const api = (chatResult as { api: ChatApi }).api;

  return { api, rift, captured };
}

const areaA = "a1" as AreaId;
const areaB = "a2" as AreaId;

describe("ChatModule", () => {
  it("say broadcasts to clients in the same area", () => {
    const { api, rift, captured } = makeHarness();

    const speaker = rift.spawn();
    speaker.set(ClientSession, { clientId: "c1" });
    speaker.set(AreaMember, { areaId: areaA });

    const listener = rift.spawn();
    listener.set(ClientSession, { clientId: "c2" });
    listener.set(AreaMember, { areaId: areaA });

    const outsider = rift.spawn();
    outsider.set(ClientSession, { clientId: "c3" });
    outsider.set(AreaMember, { areaId: areaB });

    api.say(speaker, "hello");

    expect(captured).toHaveLength(1);
    expect(captured[0].data.text).toBe("hello");
    expect(captured[0].data.fromEntityId).toBe(speaker.id);
    expect(captured[0].recipients).not.toBe("all");
    const ids = captured[0].recipients as string[];
    expect(new Set(ids)).toEqual(new Set(["c1", "c2"]));
  });

  it("say does nothing when speaker has no area", () => {
    const { api, rift, captured } = makeHarness();
    const speaker = rift.spawn();
    speaker.set(ClientSession, { clientId: "c1" });
    api.say(speaker, "hi");
    expect(captured).toHaveLength(0);
  });

  it("say does nothing when no listeners are in the area", () => {
    const { api, rift, captured } = makeHarness();
    const speaker = rift.spawn();
    speaker.set(AreaMember, { areaId: areaA });
    api.say(speaker, "hi");
    expect(captured).toHaveLength(0);
  });
});
