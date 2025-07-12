import { createMemo, Show, Suspense } from "solid-js";
import { dock } from "@mp/style";
import { useRouterState } from "@tanstack/solid-router";
import { Button, LinearProgress } from "@mp/ui";
import { ctxAuthClient, ioc, systemRoles, worldRoles } from "@mp/game/client";

import { useVersionCompatibility } from "../state/use-server-version";
import * as styles from "./app-bar.css";
import { Link } from "./link";

export default function AppBar() {
  const state = useRouterState();
  const isNavigating = createMemo(() => state().status === "pending");

  const auth = ioc.get(ctxAuthClient);

  return (
    <nav class={styles.nav}>
      <Link to="/">Home</Link>
      <Link to="/play">Play</Link>
      <Link to="/contact">Contact</Link>

      <Show when={auth.identity.get()?.roles.has(systemRoles.useDevTools)}>
        <Link to="/admin/devtools">Dev Tools</Link>
      </Show>

      <Show when={auth.identity.get()?.roles.has(worldRoles.spectate)}>
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

        {auth.isSignedIn.get() ? (
          <Button role="link" onClick={() => void auth.signOutRedirect()}>
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
