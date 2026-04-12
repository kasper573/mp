import { items as itemDefs, type ItemDefinition } from "@mp/fixtures";
import {
  Combat,
  ItemDefinitionComp,
  Stackable,
  Durable,
} from "../../components";
import { useSession, useInventory } from "../../context";
import { RespawnDialog } from "../combat/respawn-dialog";
import * as css from "./area-ui.css";

const itemDefLookup = new Map<string, ItemDefinition>(
  itemDefs.map((d) => [d.id, d]),
);

export function AreaUi() {
  const session = useSession();
  const inventory = useInventory();
  const entity = session.myEntity.value;
  const health = entity ? entity.get(Combat).health : 0;
  const myItems = inventory.myItems.value;

  return (
    <>
      <RespawnDialog open={health <= 0} />
      {myItems.length > 0 && (
        <div className={css.inventory}>
          <div className={css.label}>Inventory</div>
          <div className={css.itemGrid}>
            {myItems.map((item) => {
              const def = item.get(ItemDefinitionComp);
              const itemDef = itemDefLookup.get(def.definitionId);
              const name = itemDef?.name ?? def.definitionId;
              const type = def.itemType === 0 ? "consumable" : "equipment";

              let detail = "";
              if (item.has(Stackable)) {
                const s = item.get(Stackable);
                detail = ` x${s.stackSize}`;
              } else if (item.has(Durable)) {
                const d = item.get(Durable);
                detail = ` ${d.durability}/${d.maxDurability}`;
              }

              return (
                <div key={item.id} className={css.itemTile({ type })}>
                  {name}
                  {detail}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
