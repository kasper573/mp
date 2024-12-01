import { Show, useContext } from "solid-js";
import { AuthContext } from "@mp/auth/client";
import { dock } from "@mp/style";
import { useIsRouting } from "@solidjs/router";
import { useVersionCompatibility } from "../state/useServerVersion";
import * as styles from "./AppBar.css";
import { Button } from "./Button";
import { Link } from "./Link";
import { LinearProgress } from "./LinearProgress";

export default function AppBar() {
  const isRouting = useIsRouting();
  const auth = useContext(AuthContext);
  const versionCompatibility = useVersionCompatibility();

  return (
    <nav class={styles.nav}>
      <Link href="/">Home</Link>
      <Link href="/play">Play</Link>
      <Link href="/spring">Spring</Link>

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
