import type { ComponentChildren } from "preact";
import { HealthBar } from "./health-bar";
import { InventoryPanel } from "./inventory-panel";
import { RespawnDialog } from "./respawn-dialog";

export interface HudProps {
  children?: ComponentChildren;
}

export function Hud(props: HudProps) {
  return (
    <div>
      <HealthBar />
      <InventoryPanel />
      <RespawnDialog />
      {props.children}
    </div>
  );
}
