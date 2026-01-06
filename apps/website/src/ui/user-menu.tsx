import { useContext } from "preact/hooks";
import { AuthContext } from "../integrations/contexts";
import { Button } from "@mp/ui";

export function UserMenu() {
  const auth = useContext(AuthContext);

  if (!auth.isSignedIn.value) {
    return (
      <Button role="link" onClick={() => void auth.redirectToSignIn()}>
        Sign in
      </Button>
    );
  }

  function onSelect(e: preact.TargetedEvent<HTMLSelectElement>) {
    switch (e.currentTarget?.value) {
      case "profile":
        window.location.href = auth.getAccountConsoleUrl();
        break;
      case "signout":
        void auth.signOutRedirect();
        break;
    }
  }

  // This is a simple user menu that assumes (and only works if) the user is redirected after making a selection.
  return (
    <select onChange={onSelect} value="name">
      <option value="name" disabled>
        {auth.identity.value?.name}
      </option>
      <option value="profile">User profile</option>
      <option value="signout">Sign out</option>
    </select>
  );
}
