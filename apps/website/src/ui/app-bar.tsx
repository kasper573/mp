import { gatewayRoles, systemRoles } from "@mp/keycloak";
import { dock } from "@mp/style";
import { LinearProgress } from "@mp/ui";
import { useRouterState } from "@tanstack/react-router";
import { useContext } from "preact/hooks";
import { AuthContext } from "../integrations/contexts";
import * as styles from "./app-bar.css";
import { Link } from "./link";
import { UserMenu } from "./user-menu";

export default function AppBar() {
  const state = useRouterState();
  const isNavigating = state.status === "pending";

  const auth = useContext(AuthContext);

  return (
    <nav className={styles.nav}>
      <Link to="/">Home</Link>
      <Link to="/play">Play</Link>
      <Link to="/contact">Contact</Link>

      {auth.identity.value?.roles.has(systemRoles.useDevTools) && (
        <Link to="/admin/devtools">Dev Tools</Link>
      )}

      {auth.identity.value?.roles.has(gatewayRoles.spectate) && (
        <Link to="/admin/spectator">Spectator</Link>
      )}

      <LinearProgress
        className={dock({ position: "top" })}
        active={isNavigating}
      />
      <div className={styles.right}>
        <UserMenu />
      </div>
    </nav>
  );
}
