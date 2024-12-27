export type AuthToken = Branded<string, "AuthToken">;
export type UserId = Branded<string, "UserId">;

export interface UserIdentity {
  id: UserId;
  token: AuthToken;
  name?: string;
}

type Branded<T, Name extends string> = T & {
  __brand__: Name;
};
