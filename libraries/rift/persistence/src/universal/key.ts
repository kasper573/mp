import { string } from "@rift/core";

export type PersistenceKey = string & { readonly __brand: "PersistenceKey" };

export const PersistenceId = string<PersistenceKey>();
