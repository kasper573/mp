import SuperJSON from "superjson";

export const transformer = {
  serialize<T>(data: T): Serialized<T> {
    return SuperJSON.stringify(data) as Serialized<T>;
  },
  parse<T>(data: Serialized<T>): T {
    return SuperJSON.parse(data);
  },
};

export type Serialized<T> = string & {
  T?: T;
  __brand__: "SocketIO_TransformedData";
};
