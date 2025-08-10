import { createShortId, shortIdLength } from "@mp/std";
import { varchar } from "drizzle-orm/pg-core";

/**
 * Creates a drizzle table column definition representing a ShortId
 */
export function shortId(name?: string): DbShortId {
  const base = name
    ? varchar(name, { length: shortIdLength })
    : varchar({ length: shortIdLength });
  return base.$defaultFn(createShortId);
}

type DbShortId = ReturnType<typeof varchar>;
