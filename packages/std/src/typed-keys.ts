export type TypedKeysFn = <T extends object>(obj: T) => Array<keyof T>;
export const typedKeys = Object.keys as TypedKeysFn;
