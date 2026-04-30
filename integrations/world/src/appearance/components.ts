import { f32, object, optional, string } from "@rift/types";
import type { ActorModelId } from "../identity/ids";

export const Appearance = object({
  modelId: string<ActorModelId>(),
  name: string(),
  color: optional(f32()),
  opacity: optional(f32()),
});

export const appearanceComponents = [Appearance] as const;
export const appearanceEvents = [] as const;
