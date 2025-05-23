import type { ParentProps } from "solid-js";
import { useContext, onCleanup, createEffect, onMount } from "solid-js";
import { Container } from "pixi.js";
import { Matrix as PixiMatrix } from "pixi.js";
import { ParentContext } from "./context";

export interface PixiProps extends ParentProps {
  as?: Container;
  zIndex?: number;
  matrix?: number[];
  isRenderGroup?: boolean;
  sortableChildren?: boolean;
  position?: { x: number; y: number };
  label?: string;
}

export function Pixi(props: PixiProps) {
  const parent = useContext(ParentContext);

  // eslint-disable-next-line solid/reactivity
  const instance = props.as ?? new Container();

  onMount(() => parent.addChild(instance));
  onCleanup(() => parent.removeChild(instance));

  createEffect(() => {
    if (props.zIndex !== undefined) {
      instance.zIndex = props.zIndex;
    }
  });

  createEffect(() => (instance.isRenderGroup = props.isRenderGroup ?? false));

  createEffect(
    () => (instance.sortableChildren = props.sortableChildren ?? false),
  );

  createEffect(() => (instance.label = props.label ?? ""));

  createEffect(() => {
    if (props.position) {
      instance.position.set(props.position.x, props.position.y);
    }
  });

  createEffect(() => {
    if (props.matrix) {
      instance.setFromMatrix(new PixiMatrix(...props.matrix));
    }
  });

  return (
    <ParentContext.Provider value={instance}>
      {props.children}
    </ParentContext.Provider>
  );
}
