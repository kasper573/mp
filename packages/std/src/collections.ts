export type TypedKeysFn = <T extends object>(obj: T) => Array<keyof T>;
export const typedKeys = Object.keys as TypedKeysFn;

export function* recordValues<T>(record: Record<PropertyKey, T>): Generator<T> {
  for (const key in record) {
    yield record[key];
  }
}
