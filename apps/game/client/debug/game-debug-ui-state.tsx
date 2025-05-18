import {
  createContext,
  Show,
  useContext,
  type Accessor,
  type ParentProps,
  type Setter,
} from "solid-js";
import { Portal } from "solid-js/web";

export interface GameDebugUiState {
  portalContainer: Accessor<HTMLElement | undefined>;
  setPortalContainer: Setter<HTMLElement | undefined>;
  enabled: Accessor<boolean>;
  setEnabled: Setter<boolean>;
}

export const GameDebugUiContext = createContext<GameDebugUiState>(
  new Proxy({} as GameDebugUiState, {
    get() {
      throw new Error("GameDebugUiContext has not been initialized");
    },
  }),
);

export function GameDebugUiPortal(props: ParentProps) {
  const { portalContainer, enabled } = useContext(GameDebugUiContext);
  return (
    <Show when={enabled()}>
      <Portal mount={portalContainer()}>{props.children}</Portal>
    </Show>
  );
}
