import { Application as PixiApplication } from "@mp/pixi";
import type { JSX } from "solid-js";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  Show,
} from "solid-js";
import { ParentContext } from "./context.ts";

export interface ApplicationProps
  extends Omit<JSX.IntrinsicElements["div"], "children" | "style"> {
  children: ({ viewport }: { viewport: HTMLElement }) => JSX.Element;
  // Omitting the `style` prop from `div` because I don't know
  // how to properly merge two solid-js style values
  style?: JSX.CSSProperties;
}

export function Application(props: ApplicationProps) {
  const [viewport, setViewport] = createSignal<HTMLElement>();
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const elements = createMemo(() => [viewport(), canvas()] as const);

  const app = new PixiApplication();

  const [isInitialized] = createResource(
    elements,
    async ([viewport, canvas]) => {
      if (!viewport || !canvas) {
        return;
      }

      const initPromise = app.init({
        antialias: true,
        resizeTo: viewport,
        roundPixels: true,
        canvas,
      });

      onCleanup(async () => {
        await initPromise;
        markDestroyed(app);
        app.destroy(undefined, { children: true });
      });

      await initPromise;

      return true;
    },
  );

  createEffect(() => {
    // We need to resize the app after initializing because we assign a viewport
    // that has not yet been added to the DOM to the pixi initializer.
    // When this effect runs the vieport has been added to the DOM and we can resize the app
    // to ensure the initial size is correct. Pixi will properly handle future resizes.
    if (isInitialized() && !isAppDestroyed(app)) {
      app.resize();
    }
  });

  return (
    <div
      ref={setViewport}
      {...props}
      style={{ ...styles.container, ...props.style }}
    >
      <canvas style={styles.canvas} ref={setCanvas} />
      <Show when={isInitialized() && viewport()} keyed>
        {(viewport) => (
          <ParentContext.Provider value={app.stage}>
            <div style={styles.content}>{props.children({ viewport })}</div>
          </ParentContext.Provider>
        )}
      </Show>
    </div>
  );
}

const styles = {
  content: { position: "absolute", inset: 0 },
  canvas: { position: "absolute" },
  container: { position: "relative" },
} satisfies Record<string, JSX.CSSProperties>;

const destroyedSymbol = Symbol("destroyed");

function isAppDestroyed(app: PixiApplication) {
  return !!Reflect.get(app, destroyedSymbol);
}

function markDestroyed(app: PixiApplication) {
  Reflect.set(app, destroyedSymbol, true);
}
