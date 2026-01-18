import type { TiledObject } from "./schema/object";

export type TiledObjectTransform = readonly [
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  ty: number,
];

export function tiledObjectTransform(obj: TiledObject): TiledObjectTransform {
  const angle = (obj.rotation / 180) * Math.PI;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Translate to the rotation origin (bottom-left), rotate, then translate to obj position.
  const tx = obj.height * sin + obj.x;
  const ty = -obj.height * cos + obj.y;

  return [cos, sin, -sin, cos, tx, ty];
}
