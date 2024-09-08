import { Clerk as AuthClient } from "@clerk/clerk-js";
import { createContext, useContext, useEffect, useState } from "react";

export { AuthClient };

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
  const [isSignedIn, setIsSignedIn] = useState(!!auth.user);
  useEffect(() => auth.addListener(() => setIsSignedIn(!!auth.user)), [auth]);
  return {
    isSignedIn,
  };
}
