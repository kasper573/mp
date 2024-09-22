import type { Accessor, ParentComponent } from "solid-js";
import { createEffect, useContext } from "solid-js";
import type { Matrix } from "@mp/math";
import { Matrix as PixiMatrix } from "pixi.js";
import { ApplicationContext } from "./Application";
import { ContainerContext } from "./ContainerContext";

export interface StageProps {
  matrix?: Accessor<Matrix>;
}

export const Stage: ParentComponent<StageProps> = (props) => {
  const app = useContext(ApplicationContext);

  createEffect(() => {
    const m = props.matrix?.();
    if (m) {
      app.stage.setFromMatrix(new PixiMatrix(...m.data));
    }
  });

  return (
    <ContainerContext.Provider value={app.stage}>
      {props.children}
    </ContainerContext.Provider>
  );
};
