import { t } from "../../trpc";
import type { TraceProcedureOptions } from "./trace";
import { createTraceProcedure } from "./trace";

export interface SystemRouterDependencies {
  buildVersion: string;
  trace: TraceProcedureOptions;
}

export type SystemRouter = ReturnType<typeof createSystemRouter>;
export function createSystemRouter({
  buildVersion,
  trace,
}: SystemRouterDependencies) {
  return t.router({
    buildVersion: t.procedure.query(() => buildVersion),
    trace: createTraceProcedure(trace),
  });
}
