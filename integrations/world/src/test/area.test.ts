import { describe, expect, it } from "vitest";
import type { AreaResource, Portal } from "../area";
import type { AreaId } from "../domain-ids";
import { AreaModule } from "../modules/area/module";
import type { AreaApi } from "../modules/area/module";

function fakeArea(id: AreaId, portals: Portal[] = []): AreaResource {
  return { id, portals } as unknown as AreaResource;
}

function makeApi(): AreaApi {
  const result = AreaModule.server!({
    rift: undefined as never,
    wss: { on: () => {} },
    values: {},
    addClient: () => {},
    removeClient: () => {},
    using: () => ({}) as never,
    onTick: () => {},
  });
  return (result as { api: AreaApi }).api;
}

describe("AreaModule", () => {
  it("registers and retrieves areas", () => {
    const api = makeApi();
    const a1 = fakeArea("a1" as AreaId);
    const a2 = fakeArea("a2" as AreaId);
    api.registerArea(a1);
    api.registerArea(a2);
    expect(api.getArea("a1" as AreaId)).toBe(a1);
    expect(api.getArea("a2" as AreaId)).toBe(a2);
    expect(api.listAreas()).toHaveLength(2);
  });

  it("getArea returns undefined for unknown id", () => {
    const api = makeApi();
    expect(api.getArea("missing" as AreaId)).toBeUndefined();
  });

  it("resolvePortal returns destination by object id", () => {
    const api = makeApi();
    const portal: Portal = {
      object: { id: 42 } as Portal["object"],
      destination: {
        areaId: "b1" as AreaId,
        coords: { x: 3, y: 4 } as Portal["destination"]["coords"],
      },
    };
    api.registerArea(fakeArea("a1" as AreaId, [portal]));
    expect(api.resolvePortal("a1" as AreaId, 42)).toBe(portal.destination);
    expect(api.resolvePortal("a1" as AreaId, 99)).toBeUndefined();
    expect(api.resolvePortal("missing" as AreaId, 42)).toBeUndefined();
  });
});
