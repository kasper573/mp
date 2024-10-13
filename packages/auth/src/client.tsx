import type { Clerk as AuthClient } from "@clerk/clerk-js/headless";
import { createContext, createSignal, onCleanup, useContext } from "solid-js";



export const AuthContext = createContext<AuthClient>(
  new Proxy({} as AuthClient, {
    get() {
      throw new Error("AuthContext must be provided");
    },
  }),
);

/**
 * Stateful reactive wrapper around commonly used auth state
 */
export function useAuthState() {
  const auth = useContext(AuthContext);
  const [isSignedIn, setIsSignedIn] = createSignal(!!auth.user);
  onCleanup(auth.addListener(() => setIsSignedIn(!!auth.user)));

  return {
    isSignedIn,
  };
}

export {Clerk as AuthClient} from "@clerk/clerk-js/headless";