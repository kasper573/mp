// `any[]` is required for constructor parameter contravariance; matches the
// shape used by TypeScript's own `InstanceType` / `ConstructorParameters`.
// oxlint-disable-next-line no-explicit-any
export type Class<T = unknown> = new (...args: any[]) => T;

export type Cleanup = () => void | Promise<void>;
