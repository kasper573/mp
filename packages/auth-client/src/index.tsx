import type { User } from "oidc-client-ts";
import { UserManager } from "oidc-client-ts";
import type { Accessor } from "solid-js";
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import type { AuthToken, UserId, UserIdentity } from "@mp/auth-server";

export const AuthContext = createContext<AuthClient>(
  new Proxy({} as AuthClient, {
    get() {
      throw new Error("AuthContext must be provided");
    },
  }),
);

export interface AuthClient {
  identity: Accessor<UserIdentity | undefined>;
  isSignedIn: Accessor<boolean>;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
  redirectToSignIn(): Promise<void>;
  signInCallback(): Promise<UserIdentity | undefined>;
}

export interface AuthClientOptions {
  authority: string;
  audience: string;
  redirectUri: string;
}

export function createAuthClient(settings: AuthClientOptions): AuthClient {
  const userManager = new UserManager({
    authority: settings.authority,
    client_id: settings.audience,
    redirect_uri: settings.redirectUri,
  });
  const [identity, setIdentity] = createSignal<UserIdentity>();
  const isSignedIn = createMemo(() => !!identity());

  function handleUpdatedUser(updatedUser?: User | null) {
    const updatedIdentity = extractIdentity(updatedUser);
    if (!isEqual(updatedIdentity, identity())) {
      setIdentity(updatedIdentity);
    }
  }

  createEffect(() => {
    const subscriptions = [
      userManager.events.addUserLoaded(handleUpdatedUser),
      userManager.events.addUserUnloaded(handleUpdatedUser),
    ];

    onCleanup(() => {
      for (const unsub of subscriptions) {
        unsub();
      }
    });
  });

  async function refresh() {
    handleUpdatedUser(await userManager.getUser());
  }

  return {
    identity,
    isSignedIn,
    refresh,
    signOut: () => userManager.signoutRedirect(),
    redirectToSignIn: () => userManager.signinRedirect(),
    signInCallback: () => userManager.signinCallback().then(extractIdentity),
  };
}

function extractIdentity(user?: User | null): UserIdentity | undefined {
  if (!user) {
    return;
  }
  return {
    id: user.profile.sub as UserId,
    token: user.access_token as AuthToken,
  };
}

// A bit lazy, but it's not a lot of data and it changes infrequently, so it's fine
function isEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export {
  type AuthToken,
  type UserId,
  type UserIdentity,
} from "@mp/auth-server";
