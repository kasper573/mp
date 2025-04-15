import type { ParentProps } from "solid-js";
import { createContext, createMemo, onCleanup, Show } from "solid-js";
import { Engine } from "./engine";

export const EngineContext = createContext<Engine>(
  new Proxy({} as Engine, {
    get() {
      throw new Error("EngineContext not provided");
    },
  }),
);

export function EngineProvider(
  props: ParentProps<{
    viewport: HTMLElement;
    interactive?: boolean;
  }>,
) {
  const engine = createMemo(() => {
    const engine = new Engine(props.viewport);
    engine.start(props.interactive ?? true);
    onCleanup(engine.stop);
    return engine;
  });

  return (
    // We use a keyed Show component to force re-render so that EngineContext does not have to provide a reactive value.
    // This is a lesser-evil trade-off to avoid having to write reactive engine code in all our
    // business logic when in practice the engine instance is basically never re-created.
    // With a forced re-render, in the off chance that the engine instance would be re-created,
    // the app will instead re-render.
    <Show when={engine()} keyed>
      {(engine) => (
        <EngineContext.Provider value={engine}>
          {props.children}
        </EngineContext.Provider>
      )}
    </Show>
  );
}
