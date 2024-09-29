import { Application as PixiApplication } from "@mp/pixi";
import type { JSX } from "solid-js";
import { createMemo, createResource, createSignal, onCleanup } from "solid-js";
import { ApplicationContext, ParentContext } from "./context";

export interface ApplicationProps
  extends Omit<JSX.IntrinsicElements["div"], "children" | "style"> {
  children: ({ viewport }: { viewport: HTMLElement }) => JSX.Element;
  // Omitting the `style` prop from `div` because I don't know
  // how to properly merge two solid-js style values
  style?: JSX.CSSProperties;
}

export function Application(props: ApplicationProps) {
  const [getViewport, setViewport] = createSignal<HTMLElement | null>(null);
  const [getCanvas, setCanvas] = createSignal<HTMLCanvasElement | null>(null);
  const elements = createMemo(() => [getViewport(), getCanvas()] as const);

  const [getApp] = createResource(elements, async ([viewport, canvas]) => {
    if (!viewport || !canvas) {
      return;
    }

    const app = new PixiApplication();

    await app.init({
      antialias: true,
      resizeTo: viewport,
      roundPixels: true,
      canvas,
    });

    onCleanup(() => {
      app.destroy(undefined, { children: true });
    });

    return app;
  });

  const content = () => {
    const viewport = getViewport();
    const app = getApp();
    if (viewport && app) {
      return (
        <ApplicationContext.Provider value={app}>
          <ParentContext.Provider value={app.stage}>
            <div style={styles.content}>{props.children({ viewport })}</div>
          </ParentContext.Provider>
        </ApplicationContext.Provider>
      );
    }
  };

  return (
    <div
      ref={setViewport}
      {...props}
      style={{ ...styles.container, ...props.style }}
    >
      <canvas ref={setCanvas} />
      {content()}
    </div>
  );
}

const styles = {
  content: {
    position: "absolute",
    inset: 0,
  },
  container: {
    position: "relative",
  },
} satisfies Record<string, JSX.CSSProperties>;
