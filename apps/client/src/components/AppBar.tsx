import { useAuth, useClerk } from "@mp/auth/react";
import { Link } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { api } from "../api";
import * as styles from "./AppBar.css";
import { Button } from "./Button";

export default function AppBar() {
  const connected = useSyncExternalStore(
    (fn) => api.connected.subscribe(fn),
    () => api.connected.value,
  );
  const { isSignedIn, signOut } = useAuth();
  const clerk = useClerk();
  return (
    <nav className={styles.nav}>
      <Link to="/">Home</Link>
      <Link to="/play">Play</Link>

      <div
        className={styles.connectionIndicator({ connected })}
        title={connected ? "Connected" : "Offline"}
      />

      {isSignedIn ? (
        <Button onClick={() => void signOut()}>Sign out</Button>
      ) : (
        <Button onClick={() => void clerk.redirectToSignIn()}>Sign in</Button>
      )}
    </nav>
  );
}
