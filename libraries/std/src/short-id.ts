import { nanoid } from "nanoid";

export function createShortId<T>(): T {
  return nanoid(shortIdLength) as T;
}

export const shortIdLength = 10;
