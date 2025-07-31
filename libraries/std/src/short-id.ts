import { nanoid } from "nanoid";

export function createShortId(): string {
  return nanoid(shortIdLength);
}

export const shortIdLength = 10;
