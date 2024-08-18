import { flatten, ParseError } from "@mp/schema";

export function createError(error: unknown): string {
  if (error instanceof ParseError) {
    return JSON.stringify(flatten(error.issues), null, 2);
  }
  return String(error);
}
