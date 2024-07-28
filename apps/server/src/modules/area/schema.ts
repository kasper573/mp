import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import type { Vector } from "@mp/excalibur";

export type SessionId = string;

export class Coordinate extends Schema {
  @type("uint16") x: number;
  @type("uint16") y: number;
  constructor(x = 0, y = 0) {
    super();
    this.x = x;
    this.y = y;
  }

  override toString() {
    return `${this.x},${this.y}`;
  }

  toNearestTile() {
    return new Coordinate(Math.floor(this.x), Math.floor(this.y));
  }

  static fromVector = ({ x, y }: Vector) => new Coordinate(x, y);
}

export class Character extends Schema {
  @type("boolean") connected = false;
  @type("string") id: string;
  @type(Coordinate) coords = new Coordinate();
  @type({ array: Coordinate }) path = new ArraySchema<Coordinate>();
  @type("number") speed = 3;

  constructor(id: string) {
    super();
    this.id = id;
  }
}

export type Path = ArraySchema<Coordinate>;

export class Area extends Schema {
  @type({ map: Character }) characters = new MapSchema<Character>();
}
