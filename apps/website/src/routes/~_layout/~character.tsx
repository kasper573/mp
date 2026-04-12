import { atoms } from "@mp/style";
import { createFileRoute } from "@tanstack/react-router";
import { AuthBoundary } from "../../ui/auth-boundary";
import { NavLink } from "../../integrations/router/nav-link";

export const Route = createFileRoute("/_layout/character")({
  component: AuthBoundary.wrap(CharacterPage),
});

function CharacterPage() {
  return (
    <div style={{ maxWidth: 600 }} className={atoms({ mx: "l" })}>
      <h1>Character</h1>
      <p>
        Character is automatically created when you{" "}
        <NavLink to="/play">start playing</NavLink>.
      </p>
    </div>
  );
}
