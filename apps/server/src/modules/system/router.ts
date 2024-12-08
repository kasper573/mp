import { t } from "../../trpc.ts";

export interface SystemRouterDependencies {
  buildVersion: string;
}

export type SystemRouter = ReturnType<typeof createSystemRouter>;
export function createSystemRouter({ buildVersion }: SystemRouterDependencies) {
  return t.router({
    buildVersion: t.procedure.query(() => buildVersion),
  });
}
