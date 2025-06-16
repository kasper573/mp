import type { JSX, ParentProps } from "solid-js";
import { useContext, Switch, Match } from "solid-js";
import { AuthContext } from "@mp/auth/client";
import PermissionDenied from "../routes/permission-denied";

interface RoleProtectedRouteProps extends ParentProps {
  requiredRole: string;
}

export function RoleProtectedRoute(props: RoleProtectedRouteProps): JSX.Element {
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