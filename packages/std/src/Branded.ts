export type Branded<T, Name extends string> = T & { __brand__: Name };
