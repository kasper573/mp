export class Vector {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}
}

export type Path = Vector[];
