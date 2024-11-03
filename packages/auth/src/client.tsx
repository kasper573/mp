import { Clerk } from "@clerk/clerk-js/headless";
import type { Accessor } from "solid-js";
import { createContext, createMemo, createSignal, onCleanup } from "solid-js";

export const AuthContext = createContext<AuthClient>(
  new Proxy({} as AuthClient, {
    get() {
      throw new Error("AuthContext must be provided");
    },
  }),
);

export type AuthToken = string;

export interface AuthClient
  extends Pick<Clerk, "signOut" | "redirectToSignIn"> {
  token: Accessor<AuthToken | undefined>;
  isSignedIn: Accessor<boolean>;
  refresh(): Promise<AuthToken | undefined>;
}

export function createAuthClient(publishableKey: string): AuthClient {
  const clerk = new Clerk(publishableKey);
  const clerkReady = clerk.load();
  const [token, setToken] = createSignal<AuthToken>();
  const isSignedIn = createMemo(() => !!token());

  async function refresh() {
    await clerkReady;
    const token = (await clerk.session?.getToken()) ?? undefined;
    setToken(token);
    return token;
  }

  onCleanup(clerk.addListener(() => void refresh()));

  return { ...clerk, token, isSignedIn, refresh };
}
