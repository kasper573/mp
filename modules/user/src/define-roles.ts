import type { Branded } from "@mp/std";

export function defineRoles<const RoleNames extends string[]>(
  prefix: string,
  shortNames: RoleNames,
): RoleDefinitionRecord<RoleNames> {
  const record = Object.fromEntries(
    shortNames.map((shortName) => {
      const fullName = `${prefix}${delimiter}${shortName}` as RoleDefinition;
      return [shortName, fullName];
    }),
  );

  return record as RoleDefinitionRecord<RoleNames>;
}

export type RoleDefinition = Branded<string, "RoleDefinition">;

export type RoleDefinitionRecord<ShortNames extends string[]> = {
  [ShortName in ShortNames[number]]: RoleDefinition;
};

const delimiter = ".";
