import { gatewayRoles, systemRoles } from "@mp/keycloak";
import { dock } from "@mp/style";
import { Button, LinearProgress } from "@mp/ui";
import { useRouterState } from "@tanstack/react-router";
import { useContext } from "preact/hooks";
import { AuthContext } from "../integrations/contexts";
import * as styles from "./app-bar.css";
import { Link } from "./link";
import { graphql, useQueryBuilder } from "@mp/api-service/client";
import { useQuery } from "@tanstack/react-query";
import { env } from "../env";
import { UserMenu } from "./user-menu";

export default function AppBar() {
  const qb = useQueryBuilder();
  const state = useRouterState();
  const isNavigating = state.status === "pending";

  const auth = useContext(AuthContext);
  const { data: versionCompatibility } = useQuery({
    ...qb.queryOptions(query),
    select({ serverVersion }) {
      if (serverVersion) {
        return env.version === serverVersion ? "compatible" : "incompatible";
      }
      return "indeterminate";
    },
  });

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

        <UserMenu />
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

const query = graphql(`
  query AppBar {
    serverVersion
  }
`);
