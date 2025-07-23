import type { ImmutableInjectionContainer } from "@mp/ioc";
import { initTRPC } from "@trpc/server";

export const rpc = initTRPC.context<ApiContext>().create();

export interface ApiContext {
  ioc: ImmutableInjectionContainer;
}
