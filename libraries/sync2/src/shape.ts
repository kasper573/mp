export interface Shape {
  [key: string]: Shape | null;
}

export type ShapesFor<T> = {
  [K in keyof T]: ShapeFor<T[K]>;
};

export type ShapeFor<T> = T extends object ? ShapesFor<T> : null;
