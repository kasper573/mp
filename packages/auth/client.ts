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
import {
  extractRolesFromJwtPayload,
  isOurJwtPayload,
  type AccessToken,
  type JWTPayload,
  type UserId,
  type UserIdentity,
} from "./shared";

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
  refresh: () => Promise<void>;
  signOutRedirect: (returnUri?: string) => Promise<void>;
  redirectToSignIn: (state?: SignInState) => Promise<void>;
  signInCallback: () => Promise<SignInState | undefined>;
}

export interface AuthClientOptions {
  authority: string;
  audience: string;
  redirectUri: string;
}

export function createAuthClient(settings: AuthClientOptions): AuthClient {
  const userManager = new UserManager({
    authority: settings.authority,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    client_id: settings.audience,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    redirect_uri: settings.redirectUri,
    scope: "openid profile email roles", // A bit hacky to hardcode scope, but i don't need generic scope right now. This allows us to have built in support for ie. roles and profiles.
    loadUserInfo: true,
  });
  const [identity, setIdentity] = createSignal<UserIdentity>();
  const isSignedIn = createMemo(() => !!identity());

  function handleUpdatedUser(updatedUser?: User | null) {
    const updatedIdentity = extractIdentity(updatedUser);
    const prevIdentity = identity();
    if (!isEqual(updatedIdentity, prevIdentity)) {
      setIdentity(updatedIdentity);
    }
  }

  createEffect(() => {
    const signOut = () => userManager.signoutRedirect();
    const subscriptions = [
      userManager.events.addUserLoaded(handleUpdatedUser),
      userManager.events.addUserUnloaded(handleUpdatedUser),
      userManager.events.addAccessTokenExpired(signOut),
      userManager.events.addSilentRenewError(signOut),
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
    signOutRedirect: (returnUri = defaultReturnUrl()) =>
      userManager.signoutRedirect({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        post_logout_redirect_uri: new URL(
          returnUri,
          window.location.origin,
        ).toString(),
      }),
    redirectToSignIn: (state) => {
      state = { returnUrl: defaultReturnUrl(), ...state };
      return userManager.signinRedirect({ state });
    },
    signInCallback: () =>
      userManager.signinCallback().then((user) => {
        extractIdentity(user);
        return user?.state as SignInState | undefined;
      }),
  };
}

function defaultReturnUrl() {
  return window.location.pathname + window.location.search;
}

interface SignInState {
  returnUrl?: string;
}

function extractIdentity(user?: User | null): UserIdentity | undefined {
  if (!user) {
    return;
  }

  const payload = parseJwtPayload(user.access_token);
  if (!isOurJwtPayload(payload)) {
    throw new Error("Invalid JWT payload");
  }

  return {
    id: user.profile.sub as UserId,
    token: user.access_token as AccessToken,
    name: user.profile.name,
    roles: extractRolesFromJwtPayload(payload),
  };
}

function parseJwtPayload(jwtString: string): JWTPayload {
  const [, payload] = jwtString.split(".");
  return JSON.parse(atob(payload)) as JWTPayload;
}

// A bit lazy, but it's not a lot of data and it changes infrequently, so it's fine
function isEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
