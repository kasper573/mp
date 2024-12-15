import type { Context, JSXElement, ParentProps } from "solid-js";
import { createContext, createMemo, onCleanup, Show } from "solid-js";
import { Engine } from "./engine.ts";

export const EngineContext: Context<Engine> = createContext(
  new Proxy({} as Engine, {
    get() {
      throw new Error("EngineContext not provided");
    },
  }),
);

export function EngineProvider(
  props: ParentProps<{ viewport: HTMLElement }>,
): JSXElement {
  const engine = createMemo(() => {
    const engine = new Engine(props.viewport);
    engine.start();
    onCleanup(() => engine.stop());
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
