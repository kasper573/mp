import type { UserIdentity } from "@mp/auth";
import type { Accessor } from "solid-js";
import { createContext } from "solid-js";

/**
 * This exists to be able to detach the user identity from the auth client.
 * This is useful for when you want to override the user identity in some parts of
 * the solid tree, while still using the auth client in others.
 */
export const UserIdentityContext = createContext<
  Accessor<UserIdentity | undefined>
>(() => undefined);
