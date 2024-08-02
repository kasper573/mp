import type { Character, CharacterId } from "../character/schema";

export interface WorldState {
  characters: Map<CharacterId, Character>;
}
