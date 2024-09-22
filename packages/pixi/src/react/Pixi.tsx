import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo } from "react";
import type { Container } from "pixi.js";

export type PixiProps<
  Instance extends Container,
  InstanceProps extends object,
> = InstanceProps & {
  create: new (props: InstanceProps) => Instance;
  update?: (instance: NoInfer<Instance>) => void;
  children?: ReactNode;
};

export function Pixi<Instance extends Container, InstanceProps extends object>({
  create: Instance,
  update,
  children,
  ...props
}: PixiProps<Instance, InstanceProps>) {
  const deps: unknown[] = Object.values(props);
  const parent = useContext(ContainerContext);
  const instance = useMemo(() => new Instance(props as InstanceProps), deps);

  useEffect(() => {
    parent.addChild(instance);
    return () => {
      parent.removeChild(instance);
    };
  }, [parent, instance]);

  useEffect(() => {
    update?.(instance);
  }, [instance, ...deps]);

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
