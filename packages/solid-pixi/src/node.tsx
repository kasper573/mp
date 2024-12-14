import type { ParentProps } from "solid-js";
import { createEffect, onCleanup, onMount, useContext } from "solid-js";
import { Container } from "@mp/pixi";
import { Matrix as PixiMatrix } from "@mp/pixi";
import { ParentContext } from "./context.ts";

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
    instance.zIndex = props.zIndex ?? 0;
    instance.isRenderGroup = props.isRenderGroup ?? false;
    instance.sortableChildren = props.sortableChildren ?? false;
    instance.label = props.label ?? "";
  });

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
