// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Transformer<T = any> {
  serialize(value: T): Serialized<T>;
  deserialize(data: Serialized<T>): DeserializationResult<T>;
}

export type DeserializationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

export type Serialized<T> = (Uint8Array | string) & {
  T?: T;
  __brand__: "SocketIO_TransformedData";
};
