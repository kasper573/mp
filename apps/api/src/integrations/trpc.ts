import type { ImmutableInjectionContainer } from "@mp/ioc";
import { initTRPC } from "@trpc/server";
import { transformer } from "../transformer";
import { opt } from "../options";

export const rpc = initTRPC.context<ApiContext>().create({
  transformer,
  errorFormatter(error) {
    if (opt.exposeErrorDetails) {
      return error;
    }
    // Omit the sensitive error details
    const { shape: _, ...alwaysSafeToExpose } = error;
    return alwaysSafeToExpose;
  },
});

export interface ApiContext {
  ioc: ImmutableInjectionContainer;
}
