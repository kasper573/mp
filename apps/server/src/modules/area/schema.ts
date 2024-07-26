import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export type SessionId = string;

export type CoordinateLike = Pick<Coordinate, "x" | "y" | "__brand__">;

export class Coordinate extends Schema {
  __brand__: "Coordinate" = undefined as never;
  @type("uint16") x: number;
  @type("uint16") y: number;
  constructor(x = 0, y = 0) {
    super();
    this.x = x;
    this.y = y;
  }
}

export class Character extends Schema {
  @type("boolean") connected = false;
  @type("string") id: string;
  @type(Coordinate) coords = new Coordinate();
  @type({ array: Coordinate }) path = new ArraySchema<Coordinate>();
  speed = 5;

  constructor(id: string) {
    super();
    this.id = id;
  }
}

export type Path = ArraySchema<Coordinate>;

export class Area extends Schema {
  @type({ map: Character }) characters = new MapSchema<Character>();
}
