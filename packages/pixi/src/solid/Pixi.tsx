import type { ParentProps } from "solid-js";
import { useContext, onCleanup, onMount } from "solid-js";
import type { Container } from "pixi.js";
import { ContainerContext } from "./ContainerContext";

export type PixiProps<
  Instance extends Container,
  Deps extends object,
> = ParentProps<{ instance: Container }>;

export function Pixi<Instance extends Container, InstanceProps extends object>(
  props: PixiProps<Instance, InstanceProps>,
) {
  const parent = useContext(ContainerContext);

  onMount(() => {
    parent.addChild(props.instance);
  });

  onCleanup(() => {
    parent.removeChild(props.instance);
    props.instance.destroy();
  });

  return (
    // eslint-disable-next-line solid/reactivity
    <ContainerContext.Provider value={props.instance}>
      {props.children}
    </ContainerContext.Provider>
  );
}
