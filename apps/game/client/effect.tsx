import type { ParentProps } from "solid-js";
import { createEffect, onCleanup } from "solid-js";

/**
 * Temporary workaround until we have suspense queries
 * @deprecated
 */
export function Effect(props: ParentProps<{ effect: () => () => void }>) {
  createEffect(() => onCleanup(props.effect()));
  return <>{props.children}</>;
}
