import { AuthContext } from "@mp/auth/client";
import type { JSX, ParentProps } from "solid-js";
import { useContext, Switch, Match } from "solid-js";
import PermissionDenied from "../routes/permission-denied";

export function AuthBoundary(props: ParentProps): JSX.Element {
  const auth = useContext(AuthContext);

  return (
    <Switch>
      <Match when={auth.isSignedIn()}>{props.children}</Match>
      <Match when={!auth.isSignedIn()}>
        <PermissionDenied />
      </Match>
    </Switch>
  );
}
