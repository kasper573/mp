import type { Branded } from "@mp/std";
import type { JWTPayload } from "jose";

export type AuthToken = Branded<string, "AuthToken">;
export type UserId = Branded<string, "UserId">;
export type UserRole = string;

export interface UserIdentity {
  id: UserId;
  token: AuthToken;
  name?: string;
  roles: ReadonlySetLike<UserRole>;
}

export interface OurJWTPayload extends JWTPayload {
  realm_access: {
    roles: string[];
  };
}

export function isOurJWTPayload(payload: JWTPayload): payload is OurJWTPayload {
  return (payload as OurJWTPayload).realm_access !== undefined;
}

export function extractRolesFromJWTPayload(
  payload: OurJWTPayload,
): ReadonlySetLike<UserRole> {
  return new Set(payload.realm_access.roles);
}

export { type JWTPayload } from "jose";
