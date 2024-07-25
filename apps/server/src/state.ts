import { Schema, type, MapSchema } from "@colyseus/schema";

export type { MapSchema };

export type SessionId = string;

export type CoordinateLike = Pick<Coordinate, "x" | "y" | "__brand__">;

export class Coordinate extends Schema {
  __brand__: "Coordinate" = undefined as never;
  @type("number") x: number;
  @type("number") y: number;
  constructor(x = 0, y = 0) {
    super();
    this.x = x;
    this.y = y;
  }
}

export class Character extends Schema {
  @type("string") id: string;
  @type(Coordinate) coords = new Coordinate();

  constructor(id: string) {
    super();
    this.id = id;
  }
}

export class Area extends Schema {
  @type({ map: Character }) characters = new MapSchema<Character>();
}
