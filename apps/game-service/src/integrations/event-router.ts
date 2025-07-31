import { EventRouterBuilder } from "@mp/event-router";
import type { InjectionContainer } from "@mp/ioc";

export const evt = new EventRouterBuilder()
  .context<InjectionContainer>()
  .build();
