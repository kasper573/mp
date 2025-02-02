export function* recordValues<T>(obj: Record<PropertyKey, T>): Generator<T> {
  for (const k in obj) {
    yield obj[k];
  }
}
