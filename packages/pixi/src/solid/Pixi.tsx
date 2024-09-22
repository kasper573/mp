/* eslint-disable solid/reactivity */
import type { ParentProps } from "solid-js";
import { useContext, onCleanup, onMount, createSignal } from "solid-js";
import { Container } from "pixi.js";
import { ContainerContext } from "./ContainerContext";

export interface PixiProps extends ParentProps {
  instance?: Container;
}

export function Pixi(props: PixiProps) {
  const parent = useContext(ContainerContext);
  const [instance] = createSignal<Container>(props.instance ?? new Container());

  onMount(() => {
    parent.addChild(instance());
  });

  onCleanup(() => {
    const i = instance();
    parent.removeChild(i);
    i.destroy();
  });

  return (
    <ContainerContext.Provider value={instance()}>
      {props.children}
    </ContainerContext.Provider>
  );
}
