import { Schema, type, MapSchema } from "@colyseus/schema";

export type { MapSchema };

export type SessionId = string;

export type CoordinateLike = Pick<Coordinate, "x" | "y">;

export class Coordinate extends Schema {
  @type("number") x: number;
  @type("number") y: number;
  constructor(x = 0, y = 0) {
    super();
    this.x = x;
    this.y = y;
  }
}

export class Character extends Schema {
  @type("string") public id: string;
  @type(Coordinate) public coords = new Coordinate();

  constructor(id: string) {
    super();
    this.id = id;
  }
}

export class Area extends Schema {
  @type({ map: Character }) characters = new MapSchema<Character>();
}
