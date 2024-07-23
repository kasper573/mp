import { Schema, type, MapSchema } from "@colyseus/schema";

export interface InputData {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  tick: number;
}

export class Player extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") tick = 0;

  inputQueue: InputData[] = [];
}

export class TestRoomState extends Schema {
  @type("number") mapWidth = 0;
  @type("number") mapHeight = 0;

  @type({ map: Player }) players = new MapSchema<Player>();
}
