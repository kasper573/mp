import type { Branded } from "@mp/std";
import { shortIdLength } from "@mp/std";
import { varchar } from "drizzle-orm/pg-core";

/**
 * Creates a drizzle table column definition representing a ShortId
 */
export function shortId<Type extends Branded<string, string>>(name?: string) {
  const base = name
    ? varchar(name, { length: shortIdLength })
    : varchar({ length: shortIdLength });
  return (base as VarcharColumn).$type<Type>();
}

type VarcharColumn = ReturnType<typeof varchar>;
