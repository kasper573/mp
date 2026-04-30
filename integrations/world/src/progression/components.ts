import { f32, object } from "@rift/types";

export const Progression = object({
  xp: f32(),
});

export const progressionComponents = [Progression] as const;
export const progressionEvents = [] as const;
