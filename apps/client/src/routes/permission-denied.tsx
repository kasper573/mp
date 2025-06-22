import { AuthContext } from "@mp/auth/client";
import { Button } from "@mp/ui";
import { useContext } from "solid-js";

export default function PermissionDenied() {
  const auth = useContext(AuthContext);

  return (
    <div>
      <h1>Permission Denied</h1>
      <p>You must be signed in to access this page.</p>
      <Button onClick={() => void auth.redirectToSignIn()}>Sign in</Button>
    </div>
  );
}
