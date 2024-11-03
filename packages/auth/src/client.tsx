import { Clerk } from "@clerk/clerk-js/headless";
import type { Accessor } from "solid-js";
import { createContext, createSignal, onCleanup } from "solid-js";

export const AuthContext = createContext<AuthClient>(
  new Proxy({} as AuthClient, {
    get() {
      throw new Error("AuthContext must be provided");
    },
  }),
);

export interface AuthState {
  isSignedIn: boolean;
  token?: string;
}

export interface AuthClient
  extends Pick<Clerk, "signOut" | "redirectToSignIn"> {
  state: Accessor<AuthState>;
  refresh(): Promise<AuthState>;
}

export function createAuthClient(publishableKey: string): AuthClient {
  const clerk = new Clerk(publishableKey);
  const clerkReady = clerk.load();
  const [state, setState] = createSignal<AuthState>({
    isSignedIn: !!clerk.user,
  });

  async function refresh() {
    await clerkReady;
    const token = await clerk.session?.getToken();
    const state: AuthState = {
      isSignedIn: !!clerk.user,
      token: token ?? undefined,
    };
    setState(state);
    return state;
  }

  onCleanup(clerk.addListener(() => void refresh()));

  return { ...clerk, state, refresh };
}
