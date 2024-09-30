import { Application as PixiApplication } from "@mp/pixi";
import type { JSX } from "solid-js";
import { createEffect, onCleanup } from "solid-js";
import { ParentContext } from "./context";

export interface ApplicationProps
  extends Omit<JSX.IntrinsicElements["div"], "children" | "style"> {
  children: ({ viewport }: { viewport: HTMLElement }) => JSX.Element;
  // Omitting the `style` prop from `div` because I don't know
  // how to properly merge two solid-js style values
  style?: JSX.CSSProperties;
}

export function Application(props: ApplicationProps) {
  let viewport!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;

  const app = new PixiApplication();

  createEffect(() => {
    const initPromise = app.init({
      antialias: true,
      resizeTo: viewport,
      roundPixels: true,
      canvas,
    });

    onCleanup(async () => {
      await initPromise;
      app.destroy(undefined, { children: true });
    });
  });

  return (
    <div
      ref={viewport}
      {...props}
      style={{ ...styles.container, ...props.style }}
    >
      <canvas style={styles.canvas} ref={canvas} />
      <ParentContext.Provider value={app.stage}>
        <div style={styles.content}>{props.children({ viewport })}</div>
      </ParentContext.Provider>
    </div>
  );
}

const styles = {
  content: {
    position: "absolute",
    inset: 0,
  },
  canvas: {
    position: "absolute",
  },
  container: {
    position: "relative",
  },
} satisfies Record<string, JSX.CSSProperties>;

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 1000));
