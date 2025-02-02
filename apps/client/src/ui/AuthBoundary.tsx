import { AuthContext } from "@mp/auth/client";
import type { Component, ComponentProps, JSX, ParentProps } from "solid-js";
import { useContext, Switch, Match } from "solid-js";

export function AuthBoundary(
  props: ParentProps<{ fallback: JSX.Element }>,
): JSX.Element {
  const auth = useContext(AuthContext);

  return (
    <Switch>
      <Match when={auth.isSignedIn()}>{props.children}</Match>
      <Match when={!auth.isSignedIn()}>{props.fallback}</Match>
    </Switch>
  );
}

/**
 * Creates a new component that requires the user to be signed in.
 */
export function requireAuth<C extends Component>(
  Component: C,
  Fallback: Component,
) {
  return function ProtectedComponent(props: ComponentProps<C>) {
    return (
      <AuthBoundary fallback={<Fallback />}>
        <Component {...props} />
      </AuthBoundary>
    );
  };
}
