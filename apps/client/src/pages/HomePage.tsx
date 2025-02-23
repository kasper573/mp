import { guestIdentity } from "@mp/server";
import { UserIdentityContext } from "../integrations/userIdentity";
import { Dock } from "../ui/Dock";
import { Button } from "../ui/Button";
import { Link } from "../ui/Link";
import { Game } from "./game/Game";

export default function HomePage() {
  return (
    <UserIdentityContext.Provider value={() => guestIdentity}>
      <Game interactive={false} style={{ opacity: 0.5 }} />
      <Dock position="top">
        <div style={{ "text-align": "center", padding: "128px" }}>
          <h1 style={{ "font-size": "64px" }}>MP</h1>
          <Link href="/play">
            <Button>Play the game</Button>
          </Link>
        </div>
      </Dock>
    </UserIdentityContext.Provider>
  );
}
