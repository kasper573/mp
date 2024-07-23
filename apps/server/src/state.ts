import { Schema, type, MapSchema } from "@colyseus/schema";

export interface InputData {
  x: number;
  y: number;
}

export class Player extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;

  inputQueue: InputData[] = [];
}

export class TestRoomState extends Schema {
  @type("number") mapWidth = 0;
  @type("number") mapHeight = 0;

  @type({ map: Player }) players = new MapSchema<Player>();
}
