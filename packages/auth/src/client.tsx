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
import type { AuthToken, UserId, UserIdentity } from "./shared";

export const AuthContext = createContext<AuthClient>(
  new Proxy({} as AuthClient, {
    get() {
      throw new Error("AuthContext must be provided");
    },
  }),
);

export interface AuthClient {
  user: Accessor<UserIdentity | undefined>;
  isSignedIn: Accessor<boolean>;
  refresh(): Promise<UserIdentity | undefined>;
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
  const [user, setUser] = createSignal<UserIdentity>();
  const isSignedIn = createMemo(() => !!user());

  createEffect(() => {
    const subscriptions = [
      userManager.events.addUserLoaded((user) => {
        setUser(extractIdentity(user));
      }),
      userManager.events.addUserUnloaded(() => {
        setUser(undefined);
      }),
    ];

    onCleanup(() => {
      for (const unsub of subscriptions) {
        unsub();
      }
    });
  });

  async function refresh() {
    const identity = extractIdentity(await userManager.getUser());
    setUser(identity);
    return identity;
  }

  return {
    user,
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

export * from "./shared";
