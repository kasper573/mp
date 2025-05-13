import type { Branded } from "@mp/std";

export interface AppearanceTrait {
  color?: number; // HEX
  opacity?: number; // 0-1
  modelId: ActorModelId;
  name: string;
}

export type ActorModelId = Branded<string, "ActorModelId">;
