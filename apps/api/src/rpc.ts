import type { ImmutableInjectionContainer } from "@mp/ioc";
import { initTRPC } from "@trpc/server";
import { transformer } from "./transformer";

export const rpc = initTRPC.context<ApiContext>().create({ transformer });

export interface ApiContext {
  ioc: ImmutableInjectionContainer;
}
