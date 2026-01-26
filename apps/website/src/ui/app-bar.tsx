import { gatewayRoles, systemRoles } from "@mp/keycloak";
import { dock } from "@mp/style";
import { Button, LinearProgress } from "@mp/ui";
import { useRouterState } from "@tanstack/solid-router";
import { useContext, Show } from "solid-js";
import { AuthContext } from "../integrations/contexts";
import * as styles from "./app-bar.css";
import { Link } from "./link";
import { graphql } from "@mp/api-service/client";
import { useQueryBuilder } from "@mp/api-service/client/tanstack-query";
import { createQuery } from "@tanstack/solid-query";
import { env } from "../env";
import { UserMenu } from "./user-menu";

export default function AppBar() {
  const qb = useQueryBuilder();
  const state = useRouterState();
  const isNavigating = () => state().status === "pending";

  const auth = useContext(AuthContext);
  const versionQuery = createQuery(() => qb.queryOptions(query));
  const versionCompatibility = () => {
    const serverVersion = versionQuery.data?.serverVersion;
    if (serverVersion) {
      return env.version === serverVersion ? "compatible" : "incompatible";
    }
    return "indeterminate";
  };

  return (
    <nav class={styles.nav}>
      <Link to="/">Home</Link>
      <Link to="/play">Play</Link>
      <Link to="/contact">Contact</Link>

      <Show when={auth.identity.get()?.roles.has(systemRoles.useDevTools)}>
        <Link to="/admin/devtools">Dev Tools</Link>
      </Show>

      <Show when={auth.identity.get()?.roles.has(gatewayRoles.spectate)}>
        <Link to="/admin/spectator">Spectate</Link>
      </Show>

      <LinearProgress
        class={dock({ position: "top" })}
        active={isNavigating()}
      />
      <div class={styles.right}>
        <Show when={versionCompatibility() === "incompatible"}>
          <VersionNotice />
        </Show>

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
