import type { Path } from "@mp/patch";
import type { Tracker } from "./tracked-object";

export const emptyPath: Path = Object.freeze([]);

export function isTracker(target: unknown): target is Tracker {
  return (
    target !== null &&
    typeof target === "object" &&
    "flush" in target &&
    typeof (target as Tracker).flush === "function"
  );
}
