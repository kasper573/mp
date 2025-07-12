import { Suspense } from "react";
import { dock } from "@mp/style";
import { useRouterState } from "@tanstack/react-router";
import { Button, LinearProgress } from "@mp/ui";
import { ctxAuthClient, ioc, systemRoles, worldRoles } from "@mp/game/client";
import { useVersionCompatibility } from "../state/use-server-version";
import * as styles from "./app-bar.css";
import { Link } from "./link";

export default function AppBar() {
  const state = useRouterState();
  const isNavigating = state.status === "pending";

  const auth = ioc.get(ctxAuthClient);

  return (
    <nav className={styles.nav}>
      <Link to="/">Home</Link>
      <Link to="/play">Play</Link>
      <Link to="/contact">Contact</Link>

      {auth.identity.get()?.roles.has(systemRoles.useDevTools) && (
        <Link to="/admin/devtools">Dev Tools</Link>
      )}

      {auth.identity.get()?.roles.has(worldRoles.spectate) && (
        <Link to="/admin/spectator">Spectate</Link>
      )}

      <LinearProgress
        className={dock({ position: "top" })}
        active={isNavigating}
      />
      <div className={styles.right}>
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
  if (versionCompatibility === "incompatible") {
    return (
      <>
        There is a new version available{" "}
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </>
    );
  }

  return null;
}
