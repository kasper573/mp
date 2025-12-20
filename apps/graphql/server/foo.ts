/** @gqlType */
export interface Foo {
  /** @gqlField */
  bar: string;
}

/** @gqlQueryField */
export function whatever(): string {
  return "Hello";
}

/** @gqlQueryField */
export function foo(): Foo {
  return {
    bar: "Hello from Foo",
  };
}
