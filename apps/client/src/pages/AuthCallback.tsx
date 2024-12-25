import { AuthContext } from "@mp/auth-client";
import { useNavigate } from "@solidjs/router";
import { createResource, useContext } from "solid-js";

export default function AuthCallback() {
  const navigate = useNavigate();
  const auth = useContext(AuthContext);

  createResource(async () => {
    try {
      await auth.signInCallback();
      navigate("/play");
    } catch {
      navigate("/");
    }
  });

  return null;
}
