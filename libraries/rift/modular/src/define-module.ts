import type { AnyModule, Module, ModuleConfig } from "./types";

export function defineModule<
  const TDeps extends readonly AnyModule[],
  TClientApi extends object,
  TServerApi extends object,
>(
  config: ModuleConfig<TDeps, TClientApi, TServerApi>,
): Module<TDeps, TClientApi, TServerApi> {
  return {
    dependencies: config.dependencies ?? ([] as unknown as TDeps),
    client: config.client,
    server: config.server,
  };
}
