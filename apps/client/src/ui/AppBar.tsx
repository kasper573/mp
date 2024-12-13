import { Show, useContext } from "solid-js";
import { AuthContext } from "@mp/auth-client";
import { useIsRouting } from "@solidjs/router";
import { useVersionCompatibility } from "../state/useServerVersion.ts";
import * as styles from "./AppBar.css.ts";
import { Button } from "./Button.tsx";
import { Link } from "./Link.tsx";
import { LinearProgress } from "./LinearProgress.tsx";
import { dock } from "../style/layout.css.ts";

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
          <Button onClick={() => globalThis.location.reload()}>Reload</Button>
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
