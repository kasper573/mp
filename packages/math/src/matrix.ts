export class Matrix {
  constructor(public data: MatrixData = [1, 0, 0, 1, 0, 0]) {}

  set(...args: MatrixData): this {
    this.data = args;
    return this;
  }
}

export type MatrixData = [
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  ty: number,
];
