import type { ComponentChildren } from "preact";
import { ChatLog } from "./chat-log";
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
      <ChatLog />
      <RespawnDialog />
      {props.children}
    </div>
  );
}
