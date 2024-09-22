import {
  createContext,
  ParentProps,
  useContext,
  onCleanup,
  Accessor,
} from "solid-js";
import type { Container } from "pixi.js";
import { effect } from "solid-js/web";

export type PixiProps<
  Instance extends Container,
  Deps extends object,
> = ParentProps<{ instance: Container }>;

export function Pixi<Instance extends Container, InstanceProps extends object>({
  instance,
  children,
}: PixiProps<Instance, InstanceProps>) {
  const parent = useContext(ContainerContext);
  parent.addChild(instance);

  onCleanup(() => {
    parent.removeChild(instance);
    instance.destroy();
  });

  return (
    <ContainerContext.Provider value={instance}>
      {children}
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
