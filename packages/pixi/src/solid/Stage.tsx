import { Accessor, ParentComponent, useContext } from "solid-js";
import type { Matrix } from "@mp/math";
import { Matrix as PixiMatrix } from "pixi.js";
import { ApplicationContext } from "./Application";
import { ContainerContext } from "./Pixi";
import { effect } from "solid-js/web";

export interface StageProps {
  matrix?: Accessor<Matrix>;
}

export const Stage: ParentComponent<StageProps> = ({ matrix, children }) => {
  const app = useContext(ApplicationContext);

  if (matrix) {
    effect(() => {
      app.stage.setFromMatrix(new PixiMatrix(...matrix().data));
    });
  }

  return (
    <ContainerContext.Provider value={app.stage}>
      {children}
    </ContainerContext.Provider>
  );
};
