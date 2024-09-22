import type { ReactNode } from "react";
import { useContext, useEffect } from "react";
import type { Matrix } from "@mp/math";
import { Matrix as PixiMatrix } from "pixi.js";
import { ApplicationContext } from "./Application";
import { ContainerContext } from "./Pixi";

export interface StageProps {
  matrix?: Matrix;
  children?: ReactNode;
}

export function Stage({ children, matrix }: StageProps) {
  const app = useContext(ApplicationContext);

  useEffect(() => {
    if (matrix) {
      app.stage.setFromMatrix(new PixiMatrix(...matrix.data));
    }
  }, [app, matrix]);

  return (
    <ContainerContext.Provider value={app.stage}>
      {children}
    </ContainerContext.Provider>
  );
}
