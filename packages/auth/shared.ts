import { createSeededUuid, type Branded } from "@mp/std";
import type { JWTPayload } from "jose";

export type AuthToken = Branded<string, "AuthToken">;
export type UserId = Branded<string, "UserId">;

export interface UserIdentity {
  id: UserId;
  token: AuthToken;
  name?: string;
  roles: ReadonlySetLike<RoleDefinition>;
}

export interface OurJwtPayload extends JWTPayload {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  realm_access: {
    roles: string[];
  };
}

export function isOurJwtPayload(payload: JWTPayload): payload is OurJwtPayload {
  return (payload as Partial<OurJwtPayload>).realm_access !== undefined;
}

export function extractRolesFromJwtPayload(
  payload: OurJwtPayload,
): ReadonlySetLike<RoleDefinition> {
  return new Set(payload.realm_access.roles) as ReadonlySetLike<RoleDefinition>;
}

const bypassTokenPrefix = "bypass:";

export function createBypassUser(name: string): AuthToken {
  return (bypassTokenPrefix + name) as AuthToken;
}

export function parseBypassUser(token: AuthToken): UserIdentity | undefined {
  if (!token.startsWith(bypassTokenPrefix)) {
    return;
  }

  const name = token.slice(bypassTokenPrefix.length);
  return {
    id: createSeededUuid(
      token,
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    ) as UserId,
    token,
    roles: new Set(),
    name,
  };
}

export function defineRoles<const RoleNames extends string[]>(
  prefix: string,
  shortNames: RoleNames,
): RoleDefinitionRecord<RoleNames> {
  const record = Object.fromEntries(
    shortNames.map((shortName) => {
      const fullName = `${prefix}.${shortName}` as RoleDefinition;
      return [shortName, fullName];
    }),
  );

  return record as RoleDefinitionRecord<RoleNames>;
}

export type RoleDefinition = Branded<string, "RoleDefinition">;

export type RoleDefinitionRecord<ShortNames extends string[]> = {
  [ShortName in ShortNames[number]]: RoleDefinition;
};

export { type JWTPayload } from "jose";
