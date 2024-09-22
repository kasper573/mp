import type { ParentProps } from "solid-js";
import { createContext, useContext, onCleanup, onMount } from "solid-js";
import type { Container } from "pixi.js";

export type PixiProps<
  Instance extends Container,
  Deps extends object,
> = ParentProps<{ instance: Container }>;

export function Pixi<Instance extends Container, InstanceProps extends object>(
  props: PixiProps<Instance, InstanceProps>,
) {
  const parent = useContext(ContainerContext);

  onMount(() => {
    //console.log("Mounted", props.instance.constructor.name);
    parent.addChild(props.instance);
  });

  onCleanup(() => {
    //console.log("Destroying", props.instance.constructor.name);
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

export const ContainerContext = createContext<Container>(
  new Proxy({} as Container, {
    get() {
      throw new Error("ContainerContext not provided");
    },
  }),
);
