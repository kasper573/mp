import { Show, useContext } from "solid-js";
import { AuthContext } from "@mp/auth/client";
import { dock } from "@mp/style";
//import { useIsRouting } from "@tanstack/solid-router";
import { Button, LinearProgress } from "@mp/ui";
import { useVersionCompatibility } from "../state/useServerVersion";
import * as styles from "./AppBar.css";
import { Link } from "./Link";

export default function AppBar() {
  //const isRouting = useIsRouting();

  const auth = useContext(AuthContext);
  const versionCompatibility = useVersionCompatibility();

  return (
    <nav class={styles.nav}>
      <Link to="/">Home</Link>
      <Link to="/play">Play</Link>
      <Link to="/spring" search={{ test: 123 }}>
        Spring
      </Link>

      <LinearProgress class={dock({ position: "top" })} active={isRouting()} />
      <div class={styles.right}>
        <Show when={versionCompatibility() === "incompatible"}>
          There is a new version available{" "}
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </Show>

        {auth.isSignedIn() ? (
          <Button role="link" onClick={() => void auth.signOut()}>
            Sign out
          </Button>
        ) : (
          <Button role="link" onClick={() => void auth.redirectToSignIn()}>
            Sign in
          </Button>
        )}
      </div>
    </nav>
  );
}

const isRouting = () => false;
