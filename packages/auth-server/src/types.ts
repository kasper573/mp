import type { Branded } from "@mp/std";

export type AuthToken = Branded<string, "AuthToken">;
export type UserId = Branded<string, "UserId">;

export interface UserIdentity {
  id: UserId;
  token: AuthToken;
  name?: string;
}
