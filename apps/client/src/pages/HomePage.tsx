import { Button } from "@mp/ui";
import { Link } from "../ui/Link";

export default function HomePage() {
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
      <Link href="/play">
        <Button>Play the game</Button>
      </Link>
    </div>
  );
}
