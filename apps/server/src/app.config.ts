import config from "@colyseus/tools";
import { TestRoom } from "./room";

export default config({
  initializeGameServer(server) {
    server.define("test_room", TestRoom);
  },
});
