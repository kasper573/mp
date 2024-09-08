import { Link } from "@tanstack/react-router";
import { useContext, useSyncExternalStore } from "react";
import { useAuthState, AuthContext } from "@mp/auth/client";
import { api } from "../api";
import * as styles from "./AppBar.css";
import { Button } from "./Button";

export default function AppBar() {
  const connected = useSyncExternalStore(
    (fn) => api.connected.subscribe(fn),
    () => api.connected.value,
  );
  const auth = useContext(AuthContext);
  const { isSignedIn } = useAuthState();
  return (
    <nav className={styles.nav}>
      <Link to="/">Home</Link>
      <Link to="/play">Play</Link>

      <div
        className={styles.connectionIndicator({ connected })}
        title={connected ? "Connected" : "Offline"}
      />

      {isSignedIn ? (
        <Button onClick={() => void auth.signOut()}>Sign out</Button>
      ) : (
        <Button onClick={() => void auth.redirectToSignIn()}>Sign in</Button>
      )}
    </nav>
  );
}
