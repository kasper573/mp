import { RiftServer } from "@rift/core";
import { describe, expect, it } from "vitest";
import { ConsumableStack, EquipmentDurability, ItemMeta } from "../components";
import type {
  ConsumableDefinitionId,
  EquipmentDefinitionId,
  ItemInstanceId,
} from "../domain-ids";
import { InventoryModule } from "../modules/inventory/module";
import type { InventoryApi } from "../modules/inventory/module";
import { createWorld } from "../world";

function makeHarness(): { api: InventoryApi; rift: RiftServer } {
  const rift = new RiftServer(createWorld());
  const stubCtx = {
    rift,
    wss: { on: () => {} },
    values: {},
    addClient: () => {},
    removeClient: () => {},
    using: () => ({}) as never,
    onTick: () => {},
  };
  const result = InventoryModule.server!(stubCtx);
  return { api: (result as { api: InventoryApi }).api, rift };
}

const defA = "potion" as ConsumableDefinitionId;
const defB = "elixir" as ConsumableDefinitionId;
const eqDef = "sword" as EquipmentDefinitionId;

describe("InventoryModule", () => {
  it("createInventory returns unique ids", () => {
    const { api } = makeHarness();
    const a = api.createInventory();
    const b = api.createInventory();
    expect(a).not.toBe(b);
  });

  it("addConsumable creates entity on first add", () => {
    const { api } = makeHarness();
    const inv = api.createInventory();
    const result = api.addConsumable({
      inventoryId: inv,
      definitionId: defA,
      maxStackSize: 10,
    });
    expect(result.kind).toBe("created");
    expect(result.entity.get(ItemMeta).itemType).toBe("consumable");
    expect(result.entity.get(ConsumableStack).stackSize).toBe(1);
  });

  it("addConsumable stacks on existing entity up to maxStackSize", () => {
    const { api } = makeHarness();
    const inv = api.createInventory();
    api.addConsumable({
      inventoryId: inv,
      definitionId: defA,
      maxStackSize: 3,
    });
    const r2 = api.addConsumable({
      inventoryId: inv,
      definitionId: defA,
      maxStackSize: 3,
    });
    const r3 = api.addConsumable({
      inventoryId: inv,
      definitionId: defA,
      maxStackSize: 3,
    });
    expect(r2.kind).toBe("stacked");
    expect(r3.kind).toBe("stacked");
    if (r3.kind === "stacked") expect(r3.stackSize).toBe(3);
  });

  it("addConsumable returns full when at max", () => {
    const { api } = makeHarness();
    const inv = api.createInventory();
    api.addConsumable({
      inventoryId: inv,
      definitionId: defA,
      maxStackSize: 1,
    });
    const r = api.addConsumable({
      inventoryId: inv,
      definitionId: defA,
      maxStackSize: 1,
    });
    expect(r.kind).toBe("full");
  });

  it("addConsumable separates stacks per definition and inventory", () => {
    const { api, rift } = makeHarness();
    const inv1 = api.createInventory();
    const inv2 = api.createInventory();
    api.addConsumable({
      inventoryId: inv1,
      definitionId: defA,
      maxStackSize: 5,
    });
    api.addConsumable({
      inventoryId: inv1,
      definitionId: defB,
      maxStackSize: 5,
    });
    api.addConsumable({
      inventoryId: inv2,
      definitionId: defA,
      maxStackSize: 5,
    });
    const all = rift.query(ItemMeta, ConsumableStack).value;
    expect(all).toHaveLength(3);
  });

  it("addEquipment creates entity with durability", () => {
    const { api } = makeHarness();
    const inv = api.createInventory();
    const entity = api.addEquipment({
      inventoryId: inv,
      definitionId: eqDef,
      maxDurability: 50,
    });
    expect(entity.get(ItemMeta).itemType).toBe("equipment");
    expect(entity.get(EquipmentDurability).durability).toBe(50);
  });

  it("listItems returns items for inventory only", () => {
    const { api } = makeHarness();
    const inv1 = api.createInventory();
    const inv2 = api.createInventory();
    api.addConsumable({
      inventoryId: inv1,
      definitionId: defA,
      maxStackSize: 5,
    });
    api.addEquipment({
      inventoryId: inv1,
      definitionId: eqDef,
      maxDurability: 10,
    });
    api.addConsumable({
      inventoryId: inv2,
      definitionId: defA,
      maxStackSize: 5,
    });
    expect(api.listItems(inv1)).toHaveLength(2);
    expect(api.listItems(inv2)).toHaveLength(1);
  });

  it("findItem returns entity by instance id", () => {
    const { api } = makeHarness();
    const inv = api.createInventory();
    const r = api.addConsumable({
      inventoryId: inv,
      definitionId: defA,
      maxStackSize: 5,
    });
    const id = r.entity.get(ItemMeta).instanceId;
    const found = api.findItem(id);
    expect(found).toBeDefined();
    expect(found?.get(ItemMeta).instanceId).toBe(id);
  });

  it("removeItem destroys entity and returns true", () => {
    const { api, rift } = makeHarness();
    const inv = api.createInventory();
    const r = api.addEquipment({
      inventoryId: inv,
      definitionId: eqDef,
      maxDurability: 10,
    });
    const id = r.get(ItemMeta).instanceId;
    expect(api.removeItem(id)).toBe(true);
    expect(rift.query(ItemMeta).value).toHaveLength(0);
  });

  it("removeItem returns false for unknown instance", () => {
    const { api } = makeHarness();
    expect(api.removeItem("nope" as ItemInstanceId)).toBe(false);
  });
});
