import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import type { VectorLike } from "@mp/excalibur";
import type { UrlToPublicFile } from "../../FileReference";

export type SessionId = string;

export class Coordinate extends Schema {
  @type("number") x: number;
  @type("number") y: number;
  constructor(x = 0, y = 0) {
    super();
    this.x = x;
    this.y = y;
  }

  override toString() {
    return `${this.x},${this.y}`;
  }

  toNearestTile() {
    return new Coordinate(Math.round(this.x), Math.round(this.y));
  }

  static one = ({ x, y }: VectorLike) => new Coordinate(x, y);

  static many = (v: Iterable<VectorLike> = []): Path =>
    new ArraySchema(...Array.from(v, Coordinate.one));
}

export class Character extends Schema {
  @type("boolean") connected = false;
  @type("string") id: string;
  @type(Coordinate) coords = new Coordinate();
  @type({ array: Coordinate }) path: Path = new ArraySchema();
  @type("number") speed = 3.1;

  constructor(id: string) {
    super();
    this.id = id;
  }
}

export type Path = ArraySchema<Coordinate>;

export class AreaState extends Schema {
  @type({ map: Character }) characters = new MapSchema<Character>();
  @type("string") tiledResourceUrl!: UrlToPublicFile;

  constructor(tiledResourceUrl: UrlToPublicFile) {
    super();
    this.tiledResourceUrl = tiledResourceUrl;
  }
}
