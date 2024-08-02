import { Schema, type, MapSchema } from "@colyseus/schema";
import { Character } from "../area/schema";

export class WorldState extends Schema {
  @type({ map: Character }) characters = new MapSchema<Character>();
}
