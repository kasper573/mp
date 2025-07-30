import { ctxAuthClient, ioc } from "@mp/game-client";
import { gatewayRoles, systemRoles } from "@mp/keycloak";
import { dock } from "@mp/style";
import { Button, LinearProgress } from "@mp/ui";
import { useRouterState } from "@tanstack/react-router";
import { useVersionCompatibility } from "../state/use-server-version";
import * as styles from "./app-bar.css";
import { Link } from "./link";

export default function AppBar() {
  const state = useRouterState();
  const isNavigating = state.status === "pending";

  const auth = ioc.get(ctxAuthClient);
  const versionCompatibility = useVersionCompatibility();

  return (
    <nav className={styles.nav}>
      <Link to="/">Home</Link>
      <Link to="/play">Play</Link>
      <Link to="/contact">Contact</Link>

      {auth.identity.value?.roles.has(systemRoles.useDevTools) && (
        <Link to="/admin/devtools">Dev Tools</Link>
      )}

      {auth.identity.value?.roles.has(gatewayRoles.spectate) && (
        <Link to="/admin/spectator">Spectate</Link>
      )}

      <LinearProgress
        className={dock({ position: "top" })}
        active={isNavigating}
      />
      <div className={styles.right}>
        {versionCompatibility === "incompatible" ? <VersionNotice /> : null}

        {auth.isSignedIn.value ? (
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
  return (
    <>
      There is a new version available{" "}
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </>
  );
}
