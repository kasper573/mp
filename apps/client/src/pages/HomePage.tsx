import { guestIdentity } from "@mp/server";
import { UserIdentityContext } from "../integrations/userIdentity";
import { Game } from "./game/Game";

export default function HomePage() {
  return (
    <UserIdentityContext.Provider value={() => guestIdentity}>
      <Game interactive={false} />
    </UserIdentityContext.Provider>
  );
}
