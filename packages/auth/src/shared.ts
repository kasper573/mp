export type AuthToken = Branded<string, "AuthToken">;
export type UserId = Branded<string, "UserId">;

type Branded<T, Name extends string> = T & {
  __brand__: Name;
};
