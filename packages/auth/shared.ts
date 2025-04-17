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

export interface OurJwtPayload extends JWTPayload {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  realm_access: {
    roles: string[];
  };
}

export function isOurJwtPayload(payload: JWTPayload): payload is OurJwtPayload {
  return (payload as OurJwtPayload).realm_access !== undefined;
}

export function extractRolesFromJwtPayload(
  payload: OurJwtPayload,
): ReadonlySetLike<UserRole> {
  return new Set(payload.realm_access.roles);
}

export { type JWTPayload } from "jose";
