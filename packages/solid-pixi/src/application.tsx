import { Application as PixiApplication } from "@mp/pixi";
import type { JSX } from "solid-js";
import { createMemo, createResource, createSignal, onCleanup } from "solid-js";
import { processStyleProps } from "@mp/style";
import { ApplicationContext, ParentContext } from "./context";
import * as styles from "./application.css";

export interface ApplicationProps
  extends Omit<JSX.IntrinsicElements["div"], "children"> {
  children: ({ viewport }: { viewport: HTMLElement }) => JSX.Element;
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
            <div class={styles.content}>{props.children({ viewport })}</div>
          </ParentContext.Provider>
        </ApplicationContext.Provider>
      );
    }
  };

  return (
    <div ref={setViewport} {...processStyleProps(props, styles.container)}>
      <canvas ref={setCanvas} />
      {content()}
    </div>
  );
}
