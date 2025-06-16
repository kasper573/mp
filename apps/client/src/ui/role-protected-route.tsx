import type { JSX, ParentProps } from "solid-js";
import { useContext, Switch, Match } from "solid-js";
import { AuthContext } from "@mp/auth/client";
import type { RoleDefinition } from "@mp/game/server";
import PermissionDenied from "../routes/permission-denied";

interface RoleProtectedRouteProps extends ParentProps {
  requiredRole: RoleDefinition;
}

export function RoleProtectedRoute(
  props: RoleProtectedRouteProps,
): JSX.Element {
  const auth = useContext(AuthContext);

  const hasRequiredRole = () => {
    const identity = auth.identity();
    return identity?.roles.has(props.requiredRole) ?? false;
  };

  return (
    <Switch>
      <Match when={hasRequiredRole()}>{props.children}</Match>
      <Match when={!hasRequiredRole()}>
        <PermissionDenied />
      </Match>
    </Switch>
  );
}
