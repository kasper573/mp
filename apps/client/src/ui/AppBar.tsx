import { useContext } from "solid-js";
import { useAuthState, AuthContext } from "@mp/auth/client";
import { api } from "../state/api";
import * as styles from "./AppBar.css";
import { Button } from "./Button";
import { Link } from "./Link";

export default function AppBar() {
  const auth = useContext(AuthContext);
  const { isSignedIn } = useAuthState();
  return (
    <nav class={styles.nav}>
      <Link href="/">Home</Link>
      <Link href="/play">Play</Link>

      <div
        class={styles.connectionIndicator({
          connected: api.connected,
        })}
        title={api.connected ? "Connected" : "Offline"}
      />

      {isSignedIn() ? (
        <Button onClick={() => void auth.signOut()}>Sign out</Button>
      ) : (
        <Button onClick={() => void auth.redirectToSignIn()}>Sign in</Button>
      )}
    </nav>
  );
}
