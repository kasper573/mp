import { guestIdentity } from "@mp/server";
import { UserIdentityContext } from "../integrations/userIdentity";
import { Button } from "../ui/Button";
import { Link } from "../ui/Link";
import { Game } from "./game/Game";

export default function HomePage() {
  return (
    <UserIdentityContext.Provider value={() => guestIdentity}>
      <Game interactive={false} style={{ opacity: 0.5 }} />
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
    </UserIdentityContext.Provider>
  );
}
