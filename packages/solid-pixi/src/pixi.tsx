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

/**
 * This should be removed
 * @deprecated
 */
export function Pixi(props: PixiProps) {
  const parent = useContext(ParentContext);

  // eslint-disable-next-line solid/reactivity
  const instance = props.as ?? new Container();

  onMount(() => parent.addChild(instance));
  onCleanup(() => {
    parent.removeChild(instance);
    instance.destroy({ children: true });
  });

  createEffect(() => {
    if (props.zIndex !== undefined) {
      instance.zIndex = props.zIndex;
    }
  });

  createEffect(() => {
    if (props.isRenderGroup !== undefined) {
      instance.isRenderGroup = props.isRenderGroup;
    }
  });

  createEffect(() => {
    if (props.sortableChildren !== undefined) {
      instance.sortableChildren = props.sortableChildren;
    }
  });

  createEffect(() => {
    if (props.label !== undefined) {
      instance.label = props.label;
    }
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
