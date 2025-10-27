import type { CharacterId } from "./character";
import type { RoleDefinition, UserId } from "@mp/oauth";

export interface UserSession<Id extends string = string> {
  readonly id: Id;

  /**
   * Set when the user is authenticated
   */
  readonly user?: Readonly<{
    id: UserId;
    roles: ReadonlySetLike<RoleDefinition>;
    name: string;
  }>;

  /**
   * The character that the user will be subscribing to game state patches and events for
   */
  readonly character?: UserSessionCharacterClaim;
}

/**
 * The user may claim character data in different ways
 */
export type UserSessionCharacterClaim =
  | PlayerCharacterClaim
  | SpectatorCharacterClaim;

/**
 * Players receive game state, can control the character, and contribute to character online status.
 */
export interface PlayerCharacterClaim {
  readonly type: "player";
  readonly id: CharacterId;
}

/**
 * Spectators only receive game state and cannot control the character.
 * They also do not contribute to character online status.
 */
export interface SpectatorCharacterClaim {
  readonly type: "spectator";
  readonly id: CharacterId;
}
