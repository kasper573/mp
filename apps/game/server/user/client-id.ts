import { InjectionContext } from "@mp/ioc";
import type { Branded } from "@mp/std";

export type ClientId = Branded<string, "ClientId">;

export const ctxClientId = InjectionContext.new<ClientId>("ClientId");

// Register the ClientId type with the sync module to assert
// that the sync module only accepts client ids of the correct type.
declare module "@mp/sync" {
  interface Registry {
    clientId: ClientId;
  }
}
