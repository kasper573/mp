import { createFileRoute } from "@tanstack/solid-router";
import { Button } from "@mp/ui";
import { Link } from "../../ui/link";

export const Route = createFileRoute("/_layout/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div
      style={{
        position: "absolute",
        top: "128px",
        left: 0,
        right: 0,
        "text-align": "center",
      }}
    >
      <h1 style={{ "font-size": "64px" }}>MP</h1>
      <Link to="/play">
        <Button>Play the game</Button>
      </Link>
    </div>
  );
}
