import { Show, useContext } from "npm:solid-js";
import { AuthContext } from "@mp/auth-client";
import { dock } from "@mp/style";
import { useIsRouting } from "@solidjs/router";
import { useVersionCompatibility } from "../state/useServerVersion.ts";
import * as styles from "./AppBar.css.ts";
import { Button } from "./Button.ts";
import { Link } from "./Link.ts";
import { LinearProgress } from "./LinearProgress.ts";

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

        {auth.isSignedIn()
          ? (
            <Button role="link" onClick={() => void auth.signOut()}>
              Sign out
            </Button>
          )
          : (
            <Button role="link" onClick={() => void auth.redirectToSignIn()}>
              Sign in
            </Button>
          )}
      </div>
    </nav>
  );
}
