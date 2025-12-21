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
export function foo(input?: string | null): Foo {
  return {
    bar: `You said: ${input ?? "nothing"}`,
  };
}
