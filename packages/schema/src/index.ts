export type TypeOf<T extends Parser<unknown>> =
  T extends Parser<infer U> ? U : never;

export type Branded<T, Brand> = T & { __brand: Brand };

export type Parser<T> = (value: unknown) => T;

type ParsersForUnion<Union extends unknown[]> = {
  [Index in keyof Union]: Parser<Union[Index]>;
};

export function branded<T, Brand>(
  parser: Parser<T>,
): Parser<Branded<T, Brand>> {
  return ((value) => parser(value)) as Parser<Branded<T, Brand>>;
}

export function union<const Union extends unknown[]>(
  parsers: ParsersForUnion<Union>,
): Parser<Union[number]> {
  return (value) => {
    for (const parser of parsers) {
      try {
        return parser(value);
      } catch (e) {
        // Ignore
      }
    }
    throw new Error("No parsers matched");
  };
}

export const string: Parser<string> = (value) => {
  if (typeof value !== "string") {
    throw new Error("Expected a string");
  }
  return value;
};

export const integer: Parser<number> = (value) => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("Expected an integer");
  }
  return value;
};

export const float: Parser<number> = (value) => {
  if (typeof value !== "number") {
    throw new Error("Expected a number");
  }
  return value;
};

export const boolean: Parser<boolean> = (value) => {
  if (typeof value !== "boolean") {
    throw new Error("Expected a boolean");
  }
  return value;
};

export const oneOf = <const T>(values: T[]): Parser<T> => {
  return (value: unknown): T => {
    if (!values.includes(value as never)) {
      throw new Error(`Expected one of: ${values.join(", ")}`);
    }
    return value as T;
  };
};

export const object = <T>(schema: {
  [Key in keyof T]: Parser<T[Key]>;
}): Parser<T> => {
  return (value) => {
    if (typeof value !== "object" || value === null) {
      throw new Error("Expected an object");
    }
    const result: T = {} as T;
    for (const key in schema) {
      try {
        result[key as keyof T] = schema[key](
          value[key as keyof typeof value],
        ) as never;
      } catch (e) {
        throw new Error(`Error parsing object key ${key}: ${e}`);
      }
    }
    return result as T;
  };
};

export const array = <T>(parser: Parser<T>): Parser<T[]> => {
  return (value) => {
    if (!Array.isArray(value)) {
      throw new Error("Expected an array");
    }
    return value.map((item) => parser(item)) as T[];
  };
};

export const optional = <T>(parser: Parser<T>): Parser<T | undefined> => {
  return (value) => (value === undefined ? undefined : parser(value));
};

export const fallback = <T>(parser: Parser<T>, fallbackValue: T): Parser<T> => {
  return (value) => {
    try {
      return parser(value);
    } catch (e) {
      return fallbackValue;
    }
  };
};

export const literal = <T>(value: T): Parser<T> => {
  return (input) => {
    if (input !== value) {
      throw new Error(`Expected ${value}`);
    }
    return value;
  };
};

export const intersection = <T>(parsers: Parser<T>[]): Parser<T> => {
  return (value) => {
    const merged = {} as T;
    for (const parser of parsers) {
      Object.assign(merged as never, parser(value));
    }
    return merged;
  };
};
