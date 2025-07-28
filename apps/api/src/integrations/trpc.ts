import type { ImmutableInjectionContainer } from "@mp/ioc";
import { initTRPC } from "@trpc/server";
import { transformer } from "../transformer";
import { opt } from "../options";

export const rpc = initTRPC.context<ApiContext>().create({
  transformer,
  errorFormatter({ shape }) {
    if (opt.exposeErrorDetails) {
      return shape;
    }

    // Omit the sensitive error details
    return {
      code: shape.code,
      message: "Internal Server Error",
    };
  },
});

export interface ApiContext {
  ioc: ImmutableInjectionContainer;
}
