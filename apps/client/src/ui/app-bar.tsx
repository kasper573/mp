import { createMemo, Show, Suspense, useContext } from "solid-js";
import { AuthContext } from "@mp/auth/client";
import { dock } from "@mp/style";
import { useRouterState } from "@tanstack/solid-router";
import { Button, LinearProgress } from "@mp/ui";
import { worldRoles } from "@mp/game/client";
import { useVersionCompatibility } from "../state/use-server-version";
import * as styles from "./app-bar.css";
import { Link } from "./link";

export default function AppBar() {
  const state = useRouterState();
  const isNavigating = createMemo(() => state().status === "pending");

  const auth = useContext(AuthContext);

  return (
    <nav class={styles.nav}>
      <Link to="/">Home</Link>
      <Link to="/play">Play</Link>
      <Link to="/contact">Contact</Link>
      <Link to="/sandbox">Dev Tools</Link>
      <Link to="/actor-tester">Actor Tester</Link>

      <Show when={auth.identity()?.roles.has(worldRoles.spectate)}>
        <Link to="/admin/spectator">Spectate</Link>
      </Show>

      <LinearProgress
        class={dock({ position: "top" })}
        active={isNavigating()}
      />
      <div class={styles.right}>
        {/* 
          Suspending into nothing is okay since a pending 
          version notice isn't very interesting to the user
          */}
        <Suspense>
          <VersionNotice />
        </Suspense>

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

function VersionNotice() {
  const versionCompatibility = useVersionCompatibility();
  return (
    <Show when={versionCompatibility() === "incompatible"}>
      There is a new version available{" "}
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </Show>
  );
}
