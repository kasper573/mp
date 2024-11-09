import { Clerk } from "@clerk/clerk-js/headless";
import type { Accessor } from "solid-js";
import { createContext, createMemo, createSignal, onCleanup } from "solid-js";
import type { AuthToken } from "./shared";

export const AuthContext = createContext<BrowserAuthClient>(
  new Proxy({} as BrowserAuthClient, {
    get() {
      throw new Error("AuthContext must be provided");
    },
  }),
);

export interface BrowserAuthClient
  extends Pick<Clerk, "signOut" | "redirectToSignIn"> {
  token: Accessor<AuthToken | undefined>;
  isSignedIn: Accessor<boolean>;
  refresh(): Promise<AuthToken | undefined>;
}

export function createAuthClient(publishableKey: string): BrowserAuthClient {
  const clerk = new Clerk(publishableKey);
  const clerkReady = clerk.load();
  const [token, setToken] = createSignal<AuthToken>();
  const isSignedIn = createMemo(() => !!token());

  async function refresh() {
    await clerkReady;
    const token = (await clerk.session?.getToken()) as AuthToken | undefined;
    setToken(token);
    return token;
  }

  onCleanup(clerk.addListener(() => void refresh()));

  return { ...clerk, token, isSignedIn, refresh };
}

export * from "./shared";
