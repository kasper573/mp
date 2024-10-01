import { t } from "../factory";

export interface SystemModuleDependencies {
  buildVersion: string;
}

export type SystemModule = ReturnType<typeof createSystemModule>;
export function createSystemModule({ buildVersion }: SystemModuleDependencies) {
  return t.module({
    buildVersion: t.procedure
      .output<string>()
      .type("client-to-server")
      .create(() => buildVersion),
  });
}
