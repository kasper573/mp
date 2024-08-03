// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Serializer<T = any> = (value: T) => Serialized<T>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Parser<T = any> = (data: Serialized<T>) => T;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Serialized<T = any> = (Uint8Array | string) & {
  T?: T;
  __brand__: "SocketIO_TransformedData";
};
